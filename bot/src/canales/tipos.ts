export type Canal = "whatsapp" | "instagram";
export type TipoMensaje = "texto" | "imagen" | "audio" | "ubicacion" | "boton" | "otro";

export interface ReferenciaAnuncio {
  id?: string;
  titulo?: string;
  cuerpo?: string;
  url?: string;
  ctwaClid?: string;
}

export interface MensajeEntrante {
  canal: Canal;
  idExterno: string;
  /** WhatsApp: número del cliente. Instagram: IGSID. */
  de: string;
  nombre?: string;
  tipo: TipoMensaje;
  texto?: string;
  /** WhatsApp: id de media. */
  mediaId?: string;
  /** Instagram: URL directa del adjunto. */
  mediaUrl?: string;
  mime?: string;
  referencia?: ReferenciaAnuncio;
  /** Id del mensaje citado (WhatsApp context.id). */
  citaId?: string;
  fecha: string; // ISO
}

/** Mensaje que un humano mandó desde la app de WhatsApp Business o de Instagram. */
export interface EcoHumano {
  canal: Canal;
  idExterno: string;
  /** Cliente que recibió el mensaje. */
  para: string;
  /** Solo si no es texto: imagen, audio u otro adjunto. */
  tipo?: TipoMensaje;
  /** Texto o pie de foto (en una edición, el texto nuevo si viene). */
  texto?: string;
  /** Solo WhatsApp: Bryan editó o borró (para todos) un mensaje ya enviado. */
  accion?: "editado" | "borrado";
  fecha: string;
}

export type EventoCanal = { clase: "mensaje"; m: MensajeEntrante } | { clase: "eco"; e: EcoHumano };

export interface MediaDescargada {
  bytes: Uint8Array;
  mime: string;
}

export interface Enviador {
  texto(para: string, texto: string): Promise<string>;
  imagen(para: string, url: string, pie?: string): Promise<string>;
  /** Marca leído y muestra «escribiendo». */
  escribiendo(para: string, idMensajeCliente?: string): Promise<void>;
  plantilla(para: string, nombre: string, variables: string[]): Promise<string>;
  descargarMedia(ref: { mediaId?: string; mediaUrl?: string }): Promise<MediaDescargada>;
}

export const idEvento = (ev: EventoCanal): string =>
  ev.clase === "mensaje" ? ev.m.idExterno : ev.e.idExterno;

/** Plazo de cada llamada HTTP a Meta u OpenAI. */
export const TIEMPO_LIMITE_MS = 15_000;
/** Las descargas y subidas de archivos tienen más margen. */
export const TIEMPO_LIMITE_ARCHIVO_MS = 30_000;

/**
 * Error devuelto por la Graph API. `fueraDeVentana` indica que pasaron más de 24 h
 * desde el último mensaje del cliente: en WhatsApp hay que usar plantilla
 * (código 131047); en Instagram no hay salida (código 10, subcódigo 2018278).
 */
export class ErrorMeta extends Error {
  readonly fueraDeVentana: boolean;

  constructor(
    readonly canal: Canal,
    readonly status: number,
    readonly codigo?: number,
    readonly subcodigo?: number,
    detalle = "error",
  ) {
    super(`${canal === "whatsapp" ? "WhatsApp" : "Instagram"} ${status} ${codigo ?? ""}: ${detalle}`);
    this.name = "ErrorMeta";
    this.fueraDeVentana = canal === "whatsapp" ? codigo === 131047 : codigo === 10 && subcodigo === 2018278;
  }
}

export const esFueraDeVentana = (e: unknown): boolean => e instanceof ErrorMeta && e.fueraDeVentana;

/** Respuesta de error de la Graph API, tal como llega. */
export interface ErrorGraph {
  error?: { message?: string; code?: number; error_subcode?: number };
}
