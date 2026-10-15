import { randomUUID } from "node:crypto";
import type { Canal, EventoCanal } from "../canales/tipos.js";
import { ultimos10 } from "../config.js";
import { type FiltroProductos, filtrarProductos, type Producto } from "../negocio/productos.js";
import { avisarEcoBorrado, elegirPendiente, type HuellaEco } from "./eco.js";
import {
  type Alerta,
  type Almacen,
  type Contacto,
  type Conversacion,
  type EventoGuardado,
  type Lead,
  type LlamadaModelo,
  leadVacio,
  type Mensaje,
  type Modo,
  type NuevoMensaje,
  type Repo,
  type ResumenDia,
  type Seguimiento,
} from "./tipos.js";

/** Asigna claves presentes; las que vienen como undefined se borran. */
function aplicar<T extends object>(obj: T, cambios: Partial<T>): void {
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined) delete (obj as Record<string, unknown>)[k];
    else (obj as Record<string, unknown>)[k] = v;
  }
}

const USUARIO_IG = /^[a-z0-9._]+$/;
/** Mismos vencimientos que tomar_turnos y tomar_seguimientos en el esquema. */
const VENCE_TURNO_MS = 3 * 60_000;
const VENCE_SEGUIMIENTO_MS = 5 * 60_000;

export class RepoMemoria implements Repo {
  eventos = new Map<
    string,
    EventoGuardado & { recibido: Date; procesado?: Date; error?: string; intentos: number }
  >();
  contactos = new Map<string, Contacto>();
  conversaciones = new Map<string, Conversacion>();
  /** Conversación -> cuándo se tomó su turno (`en_proceso_desde`). */
  enProceso = new Map<string, Date>();
  mensajes: Mensaje[] = [];
  leads = new Map<string, Lead>();
  productos = new Map<string, Producto>();
  seguimientos: (Seguimiento & { tomado?: Date })[] = [];
  alertas: Alerta[] = [];
  ventanas = new Map<string, Date>();
  llamadas: LlamadaModelo[] = [];
  marcas = new Map<string, string>();
  /** Equivale a la columna `actualizado` de leads y conversaciones en Supabase. */
  actualizado = new Map<string, Date>();
  reloj: () => Date = () => new Date();

  async registrarEvento(idExterno: string, canal: Canal, evento: EventoCanal) {
    if (this.eventos.has(idExterno)) return false;
    this.eventos.set(idExterno, { idExterno, canal, evento, recibido: this.reloj(), intentos: 0 });
    return true;
  }
  async marcarEventoProcesado(idExterno: string, error?: string) {
    const e = this.eventos.get(idExterno);
    if (!e) return;
    if (error) e.error = error;
    else {
      e.procesado = this.reloj();
      delete e.error;
    }
  }
  async eventosPendientes(antesDe: Date, limite: number) {
    const pendientes = [...this.eventos.values()]
      .filter((e) => !e.procesado && e.recibido < antesDe && e.intentos < 5)
      .sort((a, b) => a.recibido.getTime() - b.recibido.getTime())
      .slice(0, limite);
    for (const e of pendientes) e.intentos++;
    return pendientes.map(({ idExterno, canal, evento }) => ({ idExterno, canal, evento }));
  }

  async contactoPorExterno(canal: Canal, idExterno: string) {
    return [...this.contactos.values()].find((c) => c.canal === canal && c.idExterno === idExterno) ?? null;
  }
  async crearContacto(c: Omit<Contacto, "id">) {
    const nuevo = { ...c, id: randomUUID() };
    this.contactos.set(nuevo.id, nuevo);
    return { ...nuevo };
  }
  async actualizarContacto(id: string, cambios: Partial<Omit<Contacto, "id">>) {
    const c = this.contactos.get(id);
    if (c) aplicar(c, cambios);
  }
  async obtenerContacto(id: string) {
    const c = this.contactos.get(id);
    if (!c) throw new Error(`Contacto ${id} no existe`);
    return { ...c };
  }

  async conversacionDeContacto(contactoId: string) {
    const c = [...this.conversaciones.values()].find((x) => x.contactoId === contactoId);
    return c ? { ...c } : null;
  }
  async crearConversacion(contactoId: string, canal: Canal) {
    const c: Conversacion = {
      id: randomUUID(),
      contactoId,
      canal,
      modo: "bot",
      estado: "nuevo",
      hilo: 1,
      avisoEsperaEnviado: false,
      toques: 0,
    };
    this.conversaciones.set(c.id, c);
    this.actualizado.set(c.id, this.reloj());
    return { ...c };
  }
  async obtenerConversacion(id: string) {
    const c = this.conversaciones.get(id);
    if (!c) throw new Error(`Conversación ${id} no existe`);
    return { ...c };
  }
  async actualizarConversacion(id: string, cambios: Partial<Omit<Conversacion, "id">>) {
    const c = this.conversaciones.get(id);
    if (!c) return;
    aplicar(c, cambios);
    this.actualizado.set(id, this.reloj());
  }
  async conversacionPorReferencia(ref: string) {
    const usuario = ref.startsWith("@") ? ref.slice(1).toLowerCase() : undefined;
    if (usuario !== undefined && !USUARIO_IG.test(usuario)) return null;
    const digitos = ultimos10(ref);
    if (usuario === "" || (usuario === undefined && digitos.length < 10)) return null;
    const contacto = [...this.contactos.values()].find((c) =>
      usuario !== undefined
        ? c.usuario?.toLowerCase() === usuario
        : ultimos10(c.telefono ?? c.idExterno) === digitos,
    );
    return contacto ? this.conversacionDeContacto(contacto.id) : null;
  }

  async guardarMensaje(m: NuevoMensaje) {
    // Igual que el unique de mensajes.id_externo: un id externo repetido ya está guardado.
    if (m.idExterno !== undefined) {
      const previo = this.mensajes.find((x) => x.idExterno === m.idExterno);
      if (previo) return { ...previo };
    }
    const nuevo: Mensaje = { ...m, id: randomUUID(), creado: m.creado ?? this.reloj() };
    this.mensajes.push(nuevo);
    return { ...nuevo };
  }
  async existeMensajeExterno(idExterno: string) {
    return this.mensajes.some((m) => m.idExterno === idExterno);
  }
  async mensajePorExterno(idExterno: string) {
    const m = this.mensajes.find((x) => x.idExterno === idExterno);
    return m ? { ...m } : null;
  }
  async asignarIdExterno(mensajeId: string, idExterno: string) {
    const fila = this.mensajes.find((x) => x.id === mensajeId);
    if (!fila || fila.idExterno === idExterno) return;
    const otro = this.mensajes.find((x) => x.idExterno === idExterno);
    if (otro) {
      // Mismo criterio que en Supabase: solo se reemplaza un eco humano posterior a la fila.
      if (otro.autor !== "humano" || otro.creado < fila.creado) return;
      this.mensajes = this.mensajes.filter((x) => x !== otro);
      avisarEcoBorrado(fila.conversacionId);
    }
    if (fila.idExterno === undefined) fila.idExterno = idExterno;
    // La copia conserva la hora del envío original para no desordenar el hilo.
    else this.mensajes.push({ ...fila, id: randomUUID(), idExterno });
  }
  async botPendienteParaEco(conversacionId: string, eco: HuellaEco, desde: Date) {
    const m = elegirPendiente(
      this.mensajes.filter(
        (x) =>
          x.conversacionId === conversacionId &&
          x.autor === "bot" &&
          x.idExterno === undefined &&
          x.creado >= desde,
      ),
      eco,
    );
    return m ? { ...m } : null;
  }
  async borrarMensaje(mensajeId: string) {
    this.mensajes = this.mensajes.filter((x) => x.id !== mensajeId);
  }
  async mensajesDelHilo(conversacionId: string, hilo: number) {
    return this.mensajes
      .filter((m) => m.conversacionId === conversacionId && m.hilo === hilo)
      .sort((a, b) => a.creado.getTime() - b.creado.getTime())
      .map((m) => ({ ...m }));
  }
  async moverAlHilo(conversacionId: string, hilo: number, ultimos: number) {
    const propios = this.mensajes
      .filter((m) => m.conversacionId === conversacionId)
      .sort((a, b) => a.creado.getTime() - b.creado.getTime());
    for (const m of propios.slice(-ultimos)) m.hilo = hilo;
  }

  async obtenerLead(conversacionId: string) {
    if (!this.leads.has(conversacionId)) {
      this.leads.set(conversacionId, leadVacio(conversacionId));
      this.actualizado.set(`lead:${conversacionId}`, this.reloj());
    }
    return structuredClone(this.leads.get(conversacionId) as Lead);
  }
  async actualizarLead(conversacionId: string, cambios: Partial<Omit<Lead, "conversacionId">>) {
    await this.obtenerLead(conversacionId);
    aplicar(this.leads.get(conversacionId) as Lead, cambios);
    this.actualizado.set(`lead:${conversacionId}`, this.reloj());
    return this.obtenerLead(conversacionId);
  }

  async buscarProductos(f: FiltroProductos) {
    return filtrarProductos([...this.productos.values()], f).map((p) => structuredClone(p));
  }
  async obtenerProducto(slug: string) {
    const p = this.productos.get(slug);
    return p ? structuredClone(p) : null;
  }
  async sincronizarProductos(ps: Producto[]) {
    const vistos = new Set(ps.map((p) => p.slug));
    let desactivados = 0;
    for (const [slug, p] of this.productos) {
      if (!vistos.has(slug) && p.activo) {
        p.activo = false;
        desactivados++;
      }
    }
    for (const p of ps) this.productos.set(p.slug, structuredClone(p));
    return { activos: ps.filter((p) => p.activo).length, desactivados };
  }
  async contarProductosActivos() {
    return [...this.productos.values()].filter((p) => p.activo).length;
  }

  async tomarTurnos(ahora: Date, limite: number) {
    const vencido = (id: string) => {
      const desde = this.enProceso.get(id);
      return desde === undefined || desde.getTime() < ahora.getTime() - VENCE_TURNO_MS;
    };
    const clave = (c: Conversacion) => (c.responderEn ?? (this.enProceso.get(c.id) as Date)).getTime();
    const candidatas = [...this.conversaciones.values()]
      .filter((c) =>
        c.responderEn ? c.responderEn <= ahora && vencido(c.id) : this.enProceso.has(c.id) && vencido(c.id),
      )
      .sort((a, b) => clave(a) - clave(b))
      .slice(0, limite);
    for (const c of candidatas) {
      this.enProceso.set(c.id, ahora);
      delete c.responderEn;
      this.actualizado.set(c.id, this.reloj());
    }
    return candidatas.map((c) => c.id);
  }
  async liberarTurno(id: string) {
    this.enProceso.delete(id);
  }

  async programarSeguimiento(s: Omit<Seguimiento, "id" | "cancelado" | "enviadoEn">) {
    this.seguimientos.push({ ...s, id: randomUUID(), cancelado: false });
  }
  async cancelarSeguimientos(conversacionId: string) {
    for (const s of this.seguimientos)
      if (s.conversacionId === conversacionId && !s.enviadoEn) s.cancelado = true;
  }
  async tomarSeguimientos(ahora: Date, limite: number) {
    const listos = this.seguimientos
      .filter(
        (s) =>
          !s.enviadoEn &&
          !s.cancelado &&
          (!s.tomado || s.tomado.getTime() < ahora.getTime() - VENCE_SEGUIMIENTO_MS) &&
          s.programadoPara <= ahora,
      )
      .sort((a, b) => a.programadoPara.getTime() - b.programadoPara.getTime())
      .slice(0, limite);
    for (const s of listos) s.tomado = ahora;
    return listos.map(({ tomado: _, ...s }) => ({ ...s }));
  }
  async marcarSeguimientoEnviado(id: string, cuando: Date) {
    const s = this.seguimientos.find((x) => x.id === id);
    if (s) s.enviadoEn = cuando;
  }

  async conversacionesConModoVencido(ahora: Date) {
    return [...this.conversaciones.values()]
      .filter(
        (c) => (c.modo === "humano" || c.modo === "esperando_humano") && c.modoHasta && c.modoHasta <= ahora,
      )
      .map((c) => ({ ...c }));
  }
  async tomarModoVencido(id: string, modo: Modo, ahora: Date) {
    const c = this.conversaciones.get(id);
    if (!c || c.modo !== modo || !c.modoHasta || c.modoHasta > ahora) return false;
    await this.actualizarConversacion(id, {
      modo: "bot",
      modoHasta: undefined,
      motivoModo: undefined,
      avisoEsperaEnviado: false,
    });
    return true;
  }

  async crearAlerta(a: Omit<Alerta, "id">) {
    const nueva = { ...a, id: randomUUID() };
    this.alertas.push(nueva);
    return { ...nueva };
  }
  async actualizarAlerta(id: string, cambios: Partial<Omit<Alerta, "id">>) {
    const a = this.alertas.find((x) => x.id === id);
    if (a) aplicar(a, cambios);
  }
  async alertasSinAtender(antesDe: Date) {
    return this.alertas
      .filter((a) => !a.atendidaEn && a.enviadaEn < antesDe)
      .sort((a, b) => a.enviadaEn.getTime() - b.enviadaEn.getTime())
      .map((a) => ({ ...a }));
  }
  async alertasParaReenviar(antesDe: Date) {
    return (await this.alertasSinAtender(antesDe)).filter((a) => a.reintentos === 0 && !a.diferida);
  }
  async tomarAlerta(id: string) {
    const a = this.alertas.find((x) => x.id === id);
    if (a?.reintentos !== 0) return false;
    a.reintentos = 1;
    return true;
  }
  async atenderAlertas(conversacionId: string, cuando: Date) {
    for (const a of this.alertas)
      if (a.conversacionId === conversacionId && !a.atendidaEn) a.atendidaEn = cuando;
  }
  async alertaPorExterno(idExterno: string) {
    const a = this.alertas.find((x) => x.idExterno === idExterno);
    return a ? { ...a } : null;
  }
  async resumenDelDia(desde: Date): Promise<ResumenDia> {
    const desdeQue = (clave: string) => (this.actualizado.get(clave) ?? new Date(0)) >= desde;
    return {
      diferidas: this.alertas
        .filter((a) => a.diferida && a.enviadaEn >= desde && !a.atendidaEn)
        .map((a) => ({ ...a })),
      sinAtender: [...this.leads.values()].filter(
        (l) => l.escaladoSinAtender && desdeQue(`lead:${l.conversacionId}`),
      ).length,
      frios: [...this.conversaciones.values()].filter((c) => c.estado === "frio" && desdeQue(c.id)).length,
    };
  }

  async registrarVentanaDueno(telefono: string, cuando: Date) {
    this.ventanas.set(ultimos10(telefono), cuando);
  }
  async ventanaDueno(telefono: string) {
    return this.ventanas.get(ultimos10(telefono)) ?? null;
  }

  async registrarLlamadaModelo(l: LlamadaModelo) {
    this.llamadas.push(l);
  }
  async leerMarca(clave: string) {
    return this.marcas.get(clave) ?? null;
  }
  async escribirMarca(clave: string, valor: string) {
    this.marcas.set(clave, valor);
  }
  async tomarMarca(clave: string, valor: string) {
    if (this.marcas.get(clave) === valor) return false;
    this.marcas.set(clave, valor);
    return true;
  }
}

export class AlmacenMemoria implements Almacen {
  archivos = new Map<string, Uint8Array>();
  async guardar(ruta: string, bytes: Uint8Array) {
    this.archivos.set(ruta, bytes);
  }
  async leer(ruta: string) {
    const b = this.archivos.get(ruta);
    if (!b) throw new Error(`No existe ${ruta}`);
    return b;
  }
}
