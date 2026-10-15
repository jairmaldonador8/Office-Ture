import type { Canal, EventoCanal, ReferenciaAnuncio, TipoMensaje } from "../canales/tipos.js";
import type { FiltroProductos, Producto } from "../negocio/productos.js";

export type Modo = "bot" | "esperando_humano" | "humano" | "pausado";
export type Estado =
  | "nuevo"
  | "calificado"
  | "cotizado"
  | "pedido"
  | "transferido"
  | "ganado"
  | "perdido"
  | "frio";
export type Autor = "cliente" | "bot" | "humano" | "sistema";

export interface Contacto {
  id: string;
  canal: Canal;
  idExterno: string;
  nombre?: string;
  usuario?: string;
  telefono?: string;
}

export interface Conversacion {
  id: string;
  contactoId: string;
  canal: Canal;
  modo: Modo;
  modoHasta?: Date;
  motivoModo?: string;
  estado: Estado;
  referencia?: ReferenciaAnuncio;
  hilo: number;
  resumenHilo?: string;
  primerCliente?: Date;
  ultimoCliente?: Date;
  ultimoBot?: Date;
  ventanaGratisHasta?: Date;
  responderEn?: Date;
  avisoEsperaEnviado: boolean;
  toques: number;
}

export interface Mensaje {
  id: string;
  conversacionId: string;
  hilo: number;
  autor: Autor;
  tipo: TipoMensaje;
  texto?: string;
  adjunto?: { ruta: string; mime: string };
  idExterno?: string;
  creado: Date;
}
export type NuevoMensaje = Omit<Mensaje, "id" | "creado"> & { creado?: Date };

export interface Lead {
  conversacionId: string;
  nombre?: string;
  empresa?: string;
  telefono?: string;
  producto?: string;
  cantidad?: number;
  color?: string;
  municipio?: string;
  direccion?: string;
  referencias?: string;
  fechaDeseada?: string;
  horarioRecibir?: string;
  factura?: boolean;
  formaPago?: string;
  presupuesto?: number;
  urgencia?: string;
  tipoCliente?: string;
  prioritario: boolean;
  motivosPrioridad: string[];
  motivoEscalacion?: string;
  escaladoSinAtender: boolean;
  avisoEnviado: boolean;
  noContactar: boolean;
  motivoPerdida?: string;
  resumen?: string;
  comentarios?: string;
}

export const leadVacio = (conversacionId: string): Lead => ({
  conversacionId,
  prioritario: false,
  motivosPrioridad: [],
  escaladoSinAtender: false,
  avisoEnviado: false,
  noContactar: false,
});

export interface Alerta {
  id: string;
  conversacionId: string;
  motivo: string;
  texto: string;
  enviadaA: string;
  idExterno?: string;
  enviadaEn: Date;
  atendidaEn?: Date;
  reintentos: number;
  diferida: boolean;
}

export interface Seguimiento {
  id: string;
  conversacionId: string;
  tipo: "toque1" | "toque2" | "cierre";
  programadoPara: Date;
  usarPlantilla: boolean;
  enviadoEn?: Date;
  cancelado: boolean;
}

export interface LlamadaModelo {
  conversacionId: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCache: number;
  herramientas: string[];
  latenciaMs: number;
  error?: string;
}

export interface EventoGuardado {
  idExterno: string;
  canal: Canal;
  evento: EventoCanal;
}

export interface ResumenDia {
  diferidas: Alerta[];
  sinAtender: number;
  frios: number;
}

export interface Repo {
  registrarEvento(idExterno: string, canal: Canal, evento: EventoCanal): Promise<boolean>;
  marcarEventoProcesado(idExterno: string, error?: string): Promise<void>;
  eventosPendientes(recibidosAntesDe: Date, limite: number): Promise<EventoGuardado[]>;

  contactoPorExterno(canal: Canal, idExterno: string): Promise<Contacto | null>;
  crearContacto(c: Omit<Contacto, "id">): Promise<Contacto>;
  actualizarContacto(id: string, cambios: Partial<Omit<Contacto, "id">>): Promise<void>;
  obtenerContacto(id: string): Promise<Contacto>;

  conversacionDeContacto(contactoId: string): Promise<Conversacion | null>;
  crearConversacion(contactoId: string, canal: Canal): Promise<Conversacion>;
  obtenerConversacion(id: string): Promise<Conversacion>;
  /** Las claves presentes con valor undefined se borran (null en base de datos). */
  actualizarConversacion(id: string, cambios: Partial<Omit<Conversacion, "id">>): Promise<void>;
  conversacionPorReferencia(ref: string): Promise<Conversacion | null>;

  guardarMensaje(m: NuevoMensaje): Promise<Mensaje>;
  existeMensajeExterno(idExterno: string): Promise<boolean>;
  mensajesDelHilo(conversacionId: string, hilo: number): Promise<Mensaje[]>;
  moverAlHilo(conversacionId: string, hilo: number, ultimos: number): Promise<void>;

  obtenerLead(conversacionId: string): Promise<Lead>;
  actualizarLead(conversacionId: string, cambios: Partial<Omit<Lead, "conversacionId">>): Promise<Lead>;

  buscarProductos(f: FiltroProductos): Promise<Producto[]>;
  obtenerProducto(slug: string): Promise<Producto | null>;
  sincronizarProductos(ps: Producto[]): Promise<{ activos: number; desactivados: number }>;

  tomarTurnos(ahora: Date, limite: number): Promise<string[]>;
  liberarTurno(conversacionId: string): Promise<void>;

  programarSeguimiento(s: Omit<Seguimiento, "id" | "cancelado" | "enviadoEn">): Promise<void>;
  cancelarSeguimientos(conversacionId: string): Promise<void>;
  tomarSeguimientos(ahora: Date, limite: number): Promise<Seguimiento[]>;
  marcarSeguimientoEnviado(id: string, cuando: Date): Promise<void>;

  conversacionesConModoVencido(ahora: Date): Promise<Conversacion[]>;

  crearAlerta(a: Omit<Alerta, "id">): Promise<Alerta>;
  actualizarAlerta(id: string, cambios: Partial<Omit<Alerta, "id">>): Promise<void>;
  alertasSinAtender(enviadasAntesDe: Date): Promise<Alerta[]>;
  atenderAlertas(conversacionId: string, cuando: Date): Promise<void>;
  alertaPorExterno(idExterno: string): Promise<Alerta | null>;
  resumenDelDia(desde: Date): Promise<ResumenDia>;

  registrarVentanaDueno(telefono: string, cuando: Date): Promise<void>;
  ventanaDueno(telefono: string): Promise<Date | null>;

  registrarLlamadaModelo(l: LlamadaModelo): Promise<void>;
  leerMarca(clave: string): Promise<string | null>;
  escribirMarca(clave: string, valor: string): Promise<void>;
}

export interface Almacen {
  guardar(ruta: string, bytes: Uint8Array, mime: string): Promise<void>;
  leer(ruta: string): Promise<Uint8Array>;
}
