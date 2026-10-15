import type {
  Enviador,
  ErrorGraph,
  EventoCanal,
  MediaDescargada,
  MensajeEntrante,
  ReferenciaAnuncio,
} from "./tipos.js";
import { ErrorMeta, TIEMPO_LIMITE_ARCHIVO_MS, TIEMPO_LIMITE_MS } from "./tipos.js";

interface WaMensaje {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  button?: { text: string };
  referral?: {
    source_id?: string;
    headline?: string;
    body?: string;
    source_url?: string;
    ctwa_clid?: string;
  };
  context?: { id?: string };
}

const iso = (ts: unknown): string => {
  const n = typeof ts === "string" || typeof ts === "number" ? Number(ts) : Number.NaN;
  const d = new Date(n * 1000);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

const objetos = (x: unknown): Record<string, unknown>[] =>
  Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null) : [];
const cadena = (x: unknown): boolean => typeof x === "string" && x !== "";

function referencia(r: WaMensaje["referral"]): ReferenciaAnuncio | undefined {
  if (!r) return undefined;
  const ref: ReferenciaAnuncio = {};
  if (r.source_id) ref.id = r.source_id;
  if (r.headline) ref.titulo = r.headline;
  if (r.body) ref.cuerpo = r.body;
  if (r.source_url) ref.url = r.source_url;
  if (r.ctwa_clid) ref.ctwaClid = r.ctwa_clid;
  return ref;
}

function mensaje(m: WaMensaje, nombre: string | undefined): MensajeEntrante {
  const base: MensajeEntrante = {
    canal: "whatsapp",
    idExterno: m.id,
    de: m.from,
    tipo: "otro",
    fecha: iso(m.timestamp),
  };
  if (nombre) base.nombre = nombre;
  const ref = referencia(m.referral);
  if (ref) base.referencia = ref;
  if (m.context?.id) base.citaId = m.context.id;
  switch (m.type) {
    case "text":
      return { ...base, tipo: "texto", texto: m.text?.body ?? "" };
    case "image": {
      const r: MensajeEntrante = { ...base, tipo: "imagen", mediaId: m.image?.id ?? "" };
      if (m.image?.mime_type) r.mime = m.image.mime_type;
      if (m.image?.caption) r.texto = m.image.caption;
      return r;
    }
    case "audio": {
      const r: MensajeEntrante = { ...base, tipo: "audio", mediaId: m.audio?.id ?? "" };
      if (m.audio?.mime_type) r.mime = m.audio.mime_type;
      return r;
    }
    case "location": {
      const l = m.location;
      const lugar = [l?.name, l?.address].filter(Boolean).join(", ");
      return {
        ...base,
        tipo: "ubicacion",
        texto: `[ubicación] ${lugar} (${l?.latitude}, ${l?.longitude})`.replace("  ", " "),
      };
    }
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      return { ...base, tipo: "boton", texto: r?.title ?? "" };
    }
    case "button":
      return { ...base, tipo: "boton", texto: m.button?.text ?? "" };
    default:
      return { ...base, texto: `[mensaje de tipo ${m.type}]` };
  }
}

export function parsearWhatsApp(payload: unknown): EventoCanal[] {
  const p = payload as { object?: string; entry?: unknown } | null;
  if (typeof p !== "object" || p === null || p.object !== "whatsapp_business_account") return [];
  const eventos: EventoCanal[] = [];
  for (const entrada of objetos(p.entry)) {
    for (const cambio of objetos(entrada.changes)) {
      const v = (typeof cambio.value === "object" && cambio.value !== null ? cambio.value : {}) as Record<
        string,
        unknown
      >;
      if (cambio.field === "messages") {
        const nombres = new Map<string, string>();
        for (const c of objetos(v.contacts)) {
          const n = (c.profile as { name?: string } | null | undefined)?.name;
          if (cadena(c.wa_id) && cadena(n)) nombres.set(c.wa_id as string, n as string);
        }
        for (const m of objetos(v.messages)) {
          if (!cadena(m.from) || !cadena(m.id)) continue;
          const msg = m as unknown as WaMensaje;
          eventos.push({ clase: "mensaje", m: mensaje(msg, nombres.get(msg.from)) });
        }
      }
      if (cambio.field === "smb_message_echoes") {
        for (const e of objetos(v.message_echoes)) {
          if (!cadena(e.to) || !cadena(e.id)) continue;
          const eco = {
            canal: "whatsapp" as const,
            idExterno: e.id as string,
            para: e.to as string,
            fecha: iso(e.timestamp),
          };
          const cuerpo = (e.text as { body?: string } | undefined)?.body;
          eventos.push({ clase: "eco", e: cuerpo ? { ...eco, texto: cuerpo } : eco });
        }
      }
    }
  }
  return eventos;
}

export interface OpcionesWhatsApp {
  phoneNumberId: string;
  token: string;
  version: string;
  fetch?: typeof fetch;
}

export class ClienteWhatsApp implements Enviador {
  private readonly f: typeof fetch;
  private readonly base: string;

  constructor(private readonly o: OpcionesWhatsApp) {
    this.f = o.fetch ?? fetch;
    this.base = `https://graph.facebook.com/${o.version}`;
  }

  private auth() {
    return { Authorization: `Bearer ${this.o.token}` };
  }

  private async post(ruta: string, cuerpo: object): Promise<{ messages?: { id: string }[] }> {
    const r = await this.f(`${this.base}/${ruta}`, {
      method: "POST",
      headers: { ...this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
    const datos = (await r.json().catch(() => ({}))) as ErrorGraph & { messages?: { id: string }[] };
    if (!r.ok || datos.error) {
      const e = datos.error;
      throw new ErrorMeta("whatsapp", r.status, e?.code, e?.error_subcode, e?.message);
    }
    return datos;
  }

  private async enviar(para: string, contenido: object): Promise<string> {
    const r = await this.post(`${this.o.phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: para,
      ...contenido,
    });
    return r.messages?.[0]?.id ?? "";
  }

  texto(para: string, texto: string) {
    return this.enviar(para, { type: "text", text: { body: texto, preview_url: false } });
  }

  async imagen(para: string, url: string, pie?: string) {
    const origen = await this.f(url, { signal: AbortSignal.timeout(TIEMPO_LIMITE_ARCHIVO_MS) });
    if (!origen.ok) throw new Error(`No se pudo bajar la foto ${url}: ${origen.status}`);
    const mime = origen.headers.get("content-type") ?? "image/jpeg";
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", mime);
    form.set("file", new Blob([await origen.arrayBuffer()], { type: mime }), "foto");
    const subida = await this.f(`${this.base}/${this.o.phoneNumberId}/media`, {
      method: "POST",
      headers: this.auth(),
      body: form,
      signal: AbortSignal.timeout(TIEMPO_LIMITE_ARCHIVO_MS),
    });
    const { id } = (await subida.json().catch(() => ({}))) as { id?: string };
    if (!subida.ok || !id) throw new Error(`No se pudo subir la foto: ${subida.status}`);
    return this.enviar(para, { type: "image", image: pie ? { id, caption: pie } : { id } });
  }

  async escribiendo(_para: string, idMensajeCliente?: string) {
    if (!idMensajeCliente) return;
    try {
      await this.post(`${this.o.phoneNumberId}/messages`, {
        messaging_product: "whatsapp",
        status: "read",
        message_id: idMensajeCliente,
        typing_indicator: { type: "text" },
      });
    } catch {
      // El indicador es cosmético: nunca debe tumbar el turno.
    }
  }

  plantilla(para: string, nombre: string, variables: string[]) {
    return this.enviar(para, {
      type: "template",
      template: {
        name: nombre,
        language: { code: "es_MX" },
        components: variables.length
          ? [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }]
          : [],
      },
    });
  }

  async descargarMedia(ref: { mediaId?: string; mediaUrl?: string }): Promise<MediaDescargada> {
    if (!ref.mediaId) throw new Error("WhatsApp necesita mediaId");
    const info = await this.f(`${this.base}/${ref.mediaId}`, {
      headers: this.auth(),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
    const { url, mime_type } = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string };
    if (!info.ok || !url) throw new Error(`Media ${ref.mediaId} no disponible: ${info.status}`);
    const bin = await this.f(url, {
      headers: this.auth(),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_ARCHIVO_MS),
    });
    if (!bin.ok) throw new Error(`No se pudo bajar media ${ref.mediaId}: ${bin.status}`);
    return { bytes: new Uint8Array(await bin.arrayBuffer()), mime: mime_type ?? "application/octet-stream" };
  }
}
