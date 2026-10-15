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
  texto?: string;
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
