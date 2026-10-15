import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Canal, EventoCanal } from "../canales/tipos.js";
import { ultimos10 } from "../config.js";
import { type FiltroProductos, filtrarProductos, type Producto } from "../negocio/productos.js";
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
  type NuevoMensaje,
  type Repo,
  type ResumenDia,
  type Seguimiento,
} from "./tipos.js";

// biome-ignore lint/suspicious/noExplicitAny: filas de Supabase sin tipos generados
type Fila = Record<string, any>;

const fecha = (v: unknown): Date | undefined => (v ? new Date(v as string) : undefined);

/** Quita claves undefined para que el objeto de dominio no tenga propiedades vacías. */
function limpio<T extends object>(o: T): T {
  for (const k of Object.keys(o))
    if ((o as Record<string, unknown>)[k] === undefined) delete (o as Record<string, unknown>)[k];
  return o;
}

/** Convierte cambios de dominio a columnas: Date → ISO, undefined → null. */
function aFila(cambios: object, columnas: Record<string, string>): Fila {
  const fila: Fila = {};
  for (const [k, v] of Object.entries(cambios)) {
    const col = columnas[k];
    if (!col) continue;
    fila[col] = v instanceof Date ? v.toISOString() : v === undefined ? null : v;
  }
  return fila;
}

const COL_CONTACTO = {
  canal: "canal",
  idExterno: "id_externo",
  nombre: "nombre",
  usuario: "usuario",
  telefono: "telefono",
};
const COL_CONV: Record<string, string> = {
  contactoId: "contacto_id",
  canal: "canal",
  modo: "modo",
  modoHasta: "modo_hasta",
  motivoModo: "motivo_modo",
  estado: "estado",
  referencia: "referencia",
  hilo: "hilo",
  resumenHilo: "resumen_hilo",
  primerCliente: "primer_cliente",
  ultimoCliente: "ultimo_cliente",
  ultimoBot: "ultimo_bot",
  ventanaGratisHasta: "ventana_gratis_hasta",
  responderEn: "responder_en",
  avisoEsperaEnviado: "aviso_espera_enviado",
  toques: "toques",
};
const COL_ALERTA: Record<string, string> = {
  conversacionId: "conversacion_id",
  motivo: "motivo",
  texto: "texto",
  enviadaA: "enviada_a",
  idExterno: "id_externo",
  enviadaEn: "enviada_en",
  atendidaEn: "atendida_en",
  reintentos: "reintentos",
  diferida: "diferida",
};

const contacto = (r: Fila): Contacto =>
  limpio({
    id: r.id,
    canal: r.canal,
    idExterno: r.id_externo,
    nombre: r.nombre ?? undefined,
    usuario: r.usuario ?? undefined,
    telefono: r.telefono ?? undefined,
  });

const conversacion = (r: Fila): Conversacion =>
  limpio({
    id: r.id,
    contactoId: r.contacto_id,
    canal: r.canal,
    modo: r.modo,
    modoHasta: fecha(r.modo_hasta),
    motivoModo: r.motivo_modo ?? undefined,
    estado: r.estado,
    referencia: r.referencia ?? undefined,
    hilo: r.hilo,
    resumenHilo: r.resumen_hilo ?? undefined,
    primerCliente: fecha(r.primer_cliente),
    ultimoCliente: fecha(r.ultimo_cliente),
    ultimoBot: fecha(r.ultimo_bot),
    ventanaGratisHasta: fecha(r.ventana_gratis_hasta),
    responderEn: fecha(r.responder_en),
    avisoEsperaEnviado: r.aviso_espera_enviado,
    toques: r.toques,
  });

const mensaje = (r: Fila): Mensaje =>
  limpio({
    id: r.id,
    conversacionId: r.conversacion_id,
    hilo: r.hilo,
    autor: r.autor,
    tipo: r.tipo,
    texto: r.texto ?? undefined,
    adjunto: r.adjunto ?? undefined,
    idExterno: r.id_externo ?? undefined,
    creado: new Date(r.creado),
  });

const alerta = (r: Fila): Alerta =>
  limpio({
    id: r.id,
    conversacionId: r.conversacion_id,
    motivo: r.motivo,
    texto: r.texto,
    enviadaA: r.enviada_a,
    idExterno: r.id_externo ?? undefined,
    enviadaEn: new Date(r.enviada_en),
    atendidaEn: fecha(r.atendida_en),
    reintentos: r.reintentos,
    diferida: r.diferida,
  });

const seguimiento = (r: Fila): Seguimiento =>
  limpio({
    id: r.id,
    conversacionId: r.conversacion_id,
    tipo: r.tipo,
    programadoPara: new Date(r.programado_para),
    usarPlantilla: r.usar_plantilla,
    enviadoEn: fecha(r.enviado_en),
    cancelado: r.cancelado,
  });

/** Nombres de usuario que Instagram permite; `*` es comodín de PostgREST y no se confía en escapar. */
const USUARIO_IG = /^[A-Za-z0-9._]+$/;

/** Escapa los comodines de LIKE para comparar texto literal. */
const literalLike = (t: string): string => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Valor entre comillas para filtros `in` de PostgREST. */
const entreComillas = (t: string): string => `"${t.replace(/["\\]/g, (c) => `\\${c}`)}"`;

function ok<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`Supabase (${que}): ${r.error.message}`);
  return r.data;
}

/** Para `.single()`: la fila tiene que existir. */
function unaFila(r: { data: Fila | null; error: { message: string } | null }, que: string): Fila {
  const f = ok(r, que);
  if (!f) throw new Error(`Supabase (${que}): sin fila`);
  return f;
}

export class RepoSupabase implements Repo {
  constructor(private readonly db: SupabaseClient) {}

  static desde(url: string, llave: string): RepoSupabase {
    return new RepoSupabase(createClient(url, llave, { auth: { persistSession: false } }));
  }

  async registrarEvento(idExterno: string, canal: Canal, evento: EventoCanal) {
    const r = await this.db
      .from("eventos")
      .upsert({ id_externo: idExterno, canal, evento }, { onConflict: "id_externo", ignoreDuplicates: true })
      .select("id_externo");
    return (ok(r, "registrarEvento") ?? []).length > 0;
  }
  async marcarEventoProcesado(idExterno: string, error?: string) {
    const cambios = error ? { error } : { procesado: new Date().toISOString(), error: null };
    ok(await this.db.from("eventos").update(cambios).eq("id_externo", idExterno), "marcarEventoProcesado");
  }
  async eventosPendientes(antesDe: Date, limite: number): Promise<EventoGuardado[]> {
    const r = await this.db
      .from("eventos")
      .select("*")
      .is("procesado", null)
      .lt("recibido", antesDe.toISOString())
      .lt("intentos", 5)
      .order("recibido")
      .limit(limite);
    const filas = ok(r, "eventosPendientes") as Fila[];
    for (const f of filas) {
      ok(
        await this.db
          .from("eventos")
          .update({ intentos: (f.intentos ?? 0) + 1 })
          .eq("id_externo", f.id_externo),
        "eventosPendientes",
      );
    }
    return filas.map((f) => ({ idExterno: f.id_externo, canal: f.canal, evento: f.evento }));
  }

  async contactoPorExterno(canal: Canal, idExterno: string) {
    const r = await this.db
      .from("contactos")
      .select("*")
      .eq("canal", canal)
      .eq("id_externo", idExterno)
      .maybeSingle();
    const f = ok(r, "contactoPorExterno");
    return f ? contacto(f) : null;
  }
  async crearContacto(c: Omit<Contacto, "id">) {
    return contacto(
      unaFila(
        await this.db.from("contactos").insert(aFila(c, COL_CONTACTO)).select().single(),
        "crearContacto",
      ),
    );
  }
  async actualizarContacto(id: string, cambios: Partial<Omit<Contacto, "id">>) {
    ok(
      await this.db.from("contactos").update(aFila(cambios, COL_CONTACTO)).eq("id", id),
      "actualizarContacto",
    );
  }
  async obtenerContacto(id: string) {
    return contacto(
      unaFila(await this.db.from("contactos").select("*").eq("id", id).single(), "obtenerContacto"),
    );
  }

  async conversacionDeContacto(contactoId: string) {
    const f = ok(
      await this.db.from("conversaciones").select("*").eq("contacto_id", contactoId).maybeSingle(),
      "conversacionDeContacto",
    );
    return f ? conversacion(f) : null;
  }
  async crearConversacion(contactoId: string, canal: Canal) {
    return conversacion(
      unaFila(
        await this.db.from("conversaciones").insert({ contacto_id: contactoId, canal }).select().single(),
        "crearConversacion",
      ),
    );
  }
  async obtenerConversacion(id: string) {
    return conversacion(
      unaFila(await this.db.from("conversaciones").select("*").eq("id", id).single(), "obtenerConversacion"),
    );
  }
  async actualizarConversacion(id: string, cambios: Partial<Omit<Conversacion, "id">>) {
    ok(
      await this.db.from("conversaciones").update(aFila(cambios, COL_CONV)).eq("id", id),
      "actualizarConversacion",
    );
  }
  async conversacionPorReferencia(ref: string) {
    const usuario = ref.startsWith("@") ? ref.slice(1) : undefined;
    const d = ultimos10(ref);
    if (usuario === "" || (usuario === undefined && d.length < 10)) return null;
    if (usuario !== undefined && !USUARIO_IG.test(usuario)) return null;
    let consulta = this.db.from("contactos").select("id, telefono, id_externo").order("creado");
    if (usuario !== undefined) consulta = consulta.ilike("usuario", literalLike(usuario));
    else consulta = consulta.or(`telefono.like.*${d},id_externo.like.*${d}`);
    const filas = ok(await consulta.limit(20), "conversacionPorReferencia") as Fila[];
    // Igual que en memoria: el teléfono manda sobre el id externo y se comparan los últimos 10 dígitos.
    const f =
      usuario !== undefined ? filas[0] : filas.find((x) => ultimos10(x.telefono ?? x.id_externo) === d);
    return f ? this.conversacionDeContacto(f.id) : null;
  }

  async guardarMensaje(m: NuevoMensaje) {
    const fila = {
      conversacion_id: m.conversacionId,
      hilo: m.hilo,
      autor: m.autor,
      tipo: m.tipo,
      texto: m.texto ?? null,
      adjunto: m.adjunto ?? null,
      id_externo: m.idExterno ?? null,
      ...(m.creado ? { creado: m.creado.toISOString() } : {}),
    };
    const r = await this.db.from("mensajes").insert(fila).select().single();
    // 23505: el id externo ya estaba guardado (el eco o un reintento ganó la carrera).
    if (r.error?.code === "23505" && m.idExterno) {
      return mensaje(
        unaFila(
          await this.db.from("mensajes").select("*").eq("id_externo", m.idExterno).single(),
          "guardarMensaje",
        ),
      );
    }
    return mensaje(unaFila(r, "guardarMensaje"));
  }
  async existeMensajeExterno(idExterno: string) {
    const r = await this.db
      .from("mensajes")
      .select("id", { count: "exact", head: true })
      .eq("id_externo", idExterno);
    if (r.error) throw new Error(`Supabase (existeMensajeExterno): ${r.error.message}`);
    return (r.count ?? 0) > 0;
  }
  async mensajesDelHilo(conversacionId: string, hilo: number) {
    const r = await this.db
      .from("mensajes")
      .select("*")
      .eq("conversacion_id", conversacionId)
      .eq("hilo", hilo)
      .order("creado");
    return (ok(r, "mensajesDelHilo") as Fila[]).map(mensaje);
  }
  async moverAlHilo(conversacionId: string, hilo: number, ultimos: number) {
    const r = await this.db
      .from("mensajes")
      .select("id")
      .eq("conversacion_id", conversacionId)
      .order("creado", { ascending: false })
      .limit(ultimos);
    const ids = (ok(r, "moverAlHilo") as Fila[]).map((f) => f.id);
    if (ids.length) ok(await this.db.from("mensajes").update({ hilo }).in("id", ids), "moverAlHilo");
  }

  async obtenerLead(conversacionId: string) {
    const f = ok(
      await this.db.from("leads").select("datos").eq("conversacion_id", conversacionId).maybeSingle(),
      "obtenerLead",
    );
    if (f) return { ...leadVacio(conversacionId), ...(f.datos as Partial<Lead>), conversacionId };
    const nuevo = leadVacio(conversacionId);
    // ignoreDuplicates: si otro proceso lo creó al mismo tiempo, no se pisan sus datos.
    ok(
      await this.db
        .from("leads")
        .upsert({ conversacion_id: conversacionId, datos: nuevo }, { ignoreDuplicates: true }),
      "obtenerLead",
    );
    return nuevo;
  }
  async actualizarLead(conversacionId: string, cambios: Partial<Omit<Lead, "conversacionId">>) {
    const actual = await this.obtenerLead(conversacionId);
    const nuevo = limpio({ ...actual, ...cambios, conversacionId });
    ok(
      await this.db.from("leads").upsert({ conversacion_id: conversacionId, datos: nuevo }),
      "actualizarLead",
    );
    return nuevo;
  }

  async buscarProductos(f: FiltroProductos) {
    let q = this.db.from("productos").select("datos").eq("activo", true);
    if (f.categoria) q = q.eq("categoria", f.categoria);
    const filas = ok(await q, "buscarProductos") as Fila[];
    return filtrarProductos(
      filas.map((x) => x.datos as Producto),
      f,
    );
  }
  async obtenerProducto(slug: string) {
    const f = ok(
      await this.db.from("productos").select("datos").eq("slug", slug).maybeSingle(),
      "obtenerProducto",
    );
    return f ? (f.datos as Producto) : null;
  }
  async sincronizarProductos(ps: Producto[]) {
    const ahora = new Date().toISOString();
    const filas = ps.map((p) => ({
      slug: p.slug,
      categoria: p.categoria,
      activo: p.activo,
      datos: p,
      sincronizado: ahora,
    }));
    ok(await this.db.from("productos").upsert(filas, { onConflict: "slug" }), "sincronizarProductos");
    let desactivar = this.db.from("productos").update({ activo: false }).eq("activo", true);
    if (ps.length)
      desactivar = desactivar.not("slug", "in", `(${ps.map((p) => entreComillas(p.slug)).join(",")})`);
    const r = await desactivar.select("slug");
    return {
      activos: ps.filter((p) => p.activo).length,
      desactivados: (ok(r, "desactivar") as Fila[]).length,
    };
  }

  async tomarTurnos(_ahora: Date, limite: number) {
    const ids = ok(await this.db.rpc("tomar_turnos", { p_limite: limite }), "tomarTurnos") as unknown;
    return (ids as (string | { tomar_turnos: string })[]).map((x) =>
      typeof x === "string" ? x : x.tomar_turnos,
    );
  }
  async liberarTurno(id: string) {
    ok(await this.db.from("conversaciones").update({ en_proceso_desde: null }).eq("id", id), "liberarTurno");
  }

  async programarSeguimiento(s: Omit<Seguimiento, "id" | "cancelado" | "enviadoEn">) {
    ok(
      await this.db.from("seguimientos").insert({
        conversacion_id: s.conversacionId,
        tipo: s.tipo,
        programado_para: s.programadoPara.toISOString(),
        usar_plantilla: s.usarPlantilla,
      }),
      "programarSeguimiento",
    );
  }
  async cancelarSeguimientos(conversacionId: string) {
    ok(
      await this.db
        .from("seguimientos")
        .update({ cancelado: true })
        .eq("conversacion_id", conversacionId)
        .is("enviado_en", null),
      "cancelarSeguimientos",
    );
  }
  async tomarSeguimientos(_ahora: Date, limite: number) {
    return (
      ok(await this.db.rpc("tomar_seguimientos", { p_limite: limite }), "tomarSeguimientos") as Fila[]
    ).map(seguimiento);
  }
  async marcarSeguimientoEnviado(id: string, cuando: Date) {
    ok(
      await this.db.from("seguimientos").update({ enviado_en: cuando.toISOString() }).eq("id", id),
      "marcarSeguimientoEnviado",
    );
  }

  async conversacionesConModoVencido(ahora: Date) {
    const r = await this.db
      .from("conversaciones")
      .select("*")
      .in("modo", ["humano", "esperando_humano"])
      .lte("modo_hasta", ahora.toISOString());
    return (ok(r, "conversacionesConModoVencido") as Fila[]).map(conversacion);
  }

  async crearAlerta(a: Omit<Alerta, "id">) {
    return alerta(
      unaFila(await this.db.from("alertas").insert(aFila(a, COL_ALERTA)).select().single(), "crearAlerta"),
    );
  }
  async actualizarAlerta(id: string, cambios: Partial<Omit<Alerta, "id">>) {
    ok(await this.db.from("alertas").update(aFila(cambios, COL_ALERTA)).eq("id", id), "actualizarAlerta");
  }
  async alertasSinAtender(antesDe: Date) {
    const r = await this.db
      .from("alertas")
      .select("*")
      .is("atendida_en", null)
      .lt("enviada_en", antesDe.toISOString())
      .order("enviada_en");
    return (ok(r, "alertasSinAtender") as Fila[]).map(alerta);
  }
  async atenderAlertas(conversacionId: string, cuando: Date) {
    ok(
      await this.db
        .from("alertas")
        .update({ atendida_en: cuando.toISOString() })
        .eq("conversacion_id", conversacionId)
        .is("atendida_en", null),
      "atenderAlertas",
    );
  }
  async alertaPorExterno(idExterno: string) {
    // id_externo no es único en la tabla: se toma la primera, igual que en memoria.
    const f = ok(
      await this.db
        .from("alertas")
        .select("*")
        .eq("id_externo", idExterno)
        .order("enviada_en")
        .limit(1)
        .maybeSingle(),
      "alertaPorExterno",
    );
    return f ? alerta(f) : null;
  }
  async resumenDelDia(desde: Date): Promise<ResumenDia> {
    const d = desde.toISOString();
    const diferidas = ok(
      await this.db
        .from("alertas")
        .select("*")
        .eq("diferida", true)
        .is("atendida_en", null)
        .gte("enviada_en", d)
        .order("enviada_en"),
      "resumen",
    ) as Fila[];
    const sinAtender = await this.db
      .from("leads")
      .select("conversacion_id", { count: "exact", head: true })
      .eq("datos->>escaladoSinAtender", "true")
      .gte("actualizado", d);
    if (sinAtender.error) throw new Error(`Supabase (resumen): ${sinAtender.error.message}`);
    const frios = await this.db
      .from("conversaciones")
      .select("id", { count: "exact", head: true })
      .eq("estado", "frio")
      .gte("actualizado", d);
    if (frios.error) throw new Error(`Supabase (resumen): ${frios.error.message}`);
    return { diferidas: diferidas.map(alerta), sinAtender: sinAtender.count ?? 0, frios: frios.count ?? 0 };
  }

  async registrarVentanaDueno(telefono: string, cuando: Date) {
    ok(
      await this.db
        .from("ventanas_duenos")
        .upsert({ telefono: ultimos10(telefono), ultimo: cuando.toISOString() }),
      "registrarVentanaDueno",
    );
  }
  async ventanaDueno(telefono: string) {
    const f = ok(
      await this.db
        .from("ventanas_duenos")
        .select("ultimo")
        .eq("telefono", ultimos10(telefono))
        .maybeSingle(),
      "ventanaDueno",
    );
    return f ? new Date(f.ultimo) : null;
  }

  /** Métrica de uso: si falla no debe tumbar la respuesta al cliente, así que el error se ignora. */
  async registrarLlamadaModelo(l: LlamadaModelo) {
    const r = await this.db.from("llamadas_modelo").insert({
      conversacion_id: l.conversacionId,
      modelo: l.modelo,
      tokens_entrada: l.tokensEntrada,
      tokens_salida: l.tokensSalida,
      tokens_cache: l.tokensCache,
      herramientas: l.herramientas,
      latencia_ms: l.latenciaMs,
      error: l.error ?? null,
    });
    if (r.error) console.warn(`Supabase (registrarLlamadaModelo): ${r.error.message}`);
  }
  async leerMarca(clave: string) {
    const f = ok(await this.db.from("marcas").select("valor").eq("clave", clave).maybeSingle(), "leerMarca");
    return f ? (f.valor as string) : null;
  }
  async escribirMarca(clave: string, valor: string) {
    ok(
      await this.db.from("marcas").upsert({ clave, valor, actualizado: new Date().toISOString() }),
      "escribirMarca",
    );
  }
}

export class AlmacenSupabase implements Almacen {
  constructor(
    private readonly db: SupabaseClient,
    private readonly bucket = "adjuntos",
  ) {}
  async guardar(ruta: string, bytes: Uint8Array, mime: string) {
    const r = await this.db.storage
      .from(this.bucket)
      .upload(ruta, bytes, { contentType: mime, upsert: true });
    if (r.error) throw new Error(`Storage: ${r.error.message}`);
  }
  async leer(ruta: string) {
    const r = await this.db.storage.from(this.bucket).download(ruta);
    if (r.error || !r.data) throw new Error(`Storage: ${r.error?.message ?? "sin datos"}`);
    return new Uint8Array(await r.data.arrayBuffer());
  }
}
