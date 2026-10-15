import type {
  Enviador,
  ErrorGraph,
  EventoCanal,
  MediaDescargada,
  MensajeEntrante,
  ReferenciaAnuncio,
} from "./tipos.js";
import { ErrorMeta, TIEMPO_LIMITE_ARCHIVO_MS, TIEMPO_LIMITE_MS } from "./tipos.js";

interface IgReferral {
  ad_id?: string;
  ref?: string;
  source?: string;
  ads_context_data?: { ad_title?: string };
}

interface IgMensaje {
  mid: string;
  text?: string;
  is_echo?: boolean;
  is_deleted?: boolean;
  attachments?: { type: string; payload?: { url?: string } }[];
  reply_to?: { story?: { id: string; url?: string } };
  referral?: IgReferral;
}

interface IgEvento {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: IgMensaje;
  referral?: IgReferral;
}

const fechaIso = (ts: unknown): string => {
  const d = new Date(typeof ts === "number" ? ts : Number.NaN);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

const objetos = (x: unknown): Record<string, unknown>[] =>
  Array.isArray(x) ? x.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null) : [];
const idDe = (x: unknown): string | undefined => {
  const id = (x as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id !== "" ? id : undefined;
};

function referencia(r: IgReferral | undefined): ReferenciaAnuncio | undefined {
  if (!r) return undefined;
  const ref: ReferenciaAnuncio = {};
  if (r.ad_id) ref.id = r.ad_id;
  if (r.ads_context_data?.ad_title) ref.titulo = r.ads_context_data.ad_title;
  return Object.keys(ref).length > 0 ? ref : undefined;
}

function mensaje(ev: IgEvento, m: IgMensaje): MensajeEntrante {
  const base: MensajeEntrante = {
    canal: "instagram",
    idExterno: m.mid,
    de: ev.sender.id,
    tipo: "otro",
    fecha: fechaIso(ev.timestamp),
  };
  const ref = referencia(m.referral ?? ev.referral);
  if (ref) base.referencia = ref;
  const adjunto = m.attachments?.[0];
  if (adjunto?.type === "image" && adjunto.payload?.url)
    return { ...base, tipo: "imagen", mediaUrl: adjunto.payload.url, mime: "image/jpeg" };
  if (adjunto?.type === "audio" && adjunto.payload?.url)
    return { ...base, tipo: "audio", mediaUrl: adjunto.payload.url, mime: "audio/mp4" };
  if (m.text !== undefined) {
    const prefijo = m.reply_to?.story ? "[respondió a una historia] " : "";
    return { ...base, tipo: "texto", texto: `${prefijo}${m.text}` };
  }
  return { ...base, texto: `[adjunto de tipo ${adjunto?.type ?? "desconocido"}]` };
}

export function parsearInstagram(payload: unknown, igUserId: string): EventoCanal[] {
  const p = payload as { object?: string; entry?: unknown } | null;
  if (typeof p !== "object" || p === null || p.object !== "instagram") return [];
  const eventos: EventoCanal[] = [];
  for (const entrada of objetos(p.entry)) {
    for (const raw of objetos(entrada.messaging)) {
      const m = (typeof raw.message === "object" ? raw.message : null) as IgMensaje | null;
      if (!m || m.is_deleted) continue;
      const emisor = idDe(raw.sender);
      const receptor = idDe(raw.recipient);
      if (typeof m.mid !== "string" || m.mid === "") continue;
      if (m.is_echo) {
        if (!receptor) continue;
        const eco = {
          canal: "instagram" as const,
          idExterno: m.mid,
          para: receptor,
          fecha: fechaIso(raw.timestamp),
        };
        eventos.push({ clase: "eco", e: m.text ? { ...eco, texto: m.text } : eco });
        continue;
      }
      if (!emisor || emisor === igUserId) continue;
      const ev: IgEvento = {
        sender: { id: emisor },
        recipient: { id: receptor ?? "" },
        timestamp: raw.timestamp as number,
        message: m,
      };
      if (raw.referral) ev.referral = raw.referral as IgReferral;
      eventos.push({ clase: "mensaje", m: mensaje(ev, m) });
    }
  }
  return eventos;
}

export interface OpcionesInstagram {
  pageToken: string;
  version: string;
  fetch?: typeof fetch;
}

/** Recorta a un máximo de bytes UTF-8 sin partir caracteres (ni pares sustitutos). */
export function recortarBytes(texto: string, max: number): string {
  if (Buffer.byteLength(texto) <= max) return texto;
  const letras = Array.from(texto);
  while (letras.length && Buffer.byteLength(letras.join("")) > max - 3) letras.pop();
  return `${letras.join("")}...`;
}

export class ClienteInstagram implements Enviador {
  private readonly f: typeof fetch;
  private readonly base: string;

  constructor(private readonly o: OpcionesInstagram) {
    this.f = o.fetch ?? fetch;
    this.base = `https://graph.facebook.com/${o.version}`;
  }

  private auth() {
    return { Authorization: `Bearer ${this.o.pageToken}` };
  }

  private async enviar(cuerpo: object): Promise<string> {
    const r = await this.f(`${this.base}/me/messages`, {
      method: "POST",
      headers: { ...this.auth(), "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
    const datos = (await r.json().catch(() => ({}))) as ErrorGraph & { message_id?: string };
    if (!r.ok || datos.error) {
      const e = datos.error;
      throw new ErrorMeta("instagram", r.status, e?.code, e?.error_subcode, e?.message);
    }
    return datos.message_id ?? "";
  }

  texto(para: string, texto: string) {
    return this.enviar({
      recipient: { id: para },
      messaging_type: "RESPONSE",
      message: { text: recortarBytes(texto, 1000) },
    });
  }

  imagen(para: string, url: string) {
    return this.enviar({
      recipient: { id: para },
      messaging_type: "RESPONSE",
      message: { attachment: { type: "image", payload: { url, is_reusable: false } } },
    });
  }

  async escribiendo(para: string) {
    for (const accion of ["mark_seen", "typing_on"]) {
      try {
        await this.enviar({ recipient: { id: para }, sender_action: accion });
      } catch {
        // Cosmético.
      }
    }
  }

  async plantilla(_para: string, _nombre: string, _variables: string[]): Promise<string> {
    throw new Error("Instagram no tiene plantillas: fuera de la ventana de 24 h no se puede escribir");
  }

  async descargarMedia(ref: { mediaId?: string; mediaUrl?: string }): Promise<MediaDescargada> {
    if (!ref.mediaUrl) throw new Error("Instagram necesita mediaUrl");
    const r = await this.f(ref.mediaUrl, { signal: AbortSignal.timeout(TIEMPO_LIMITE_ARCHIVO_MS) });
    if (!r.ok) throw new Error(`No se pudo bajar el adjunto: ${r.status}`);
    return {
      bytes: new Uint8Array(await r.arrayBuffer()),
      mime: r.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  async perfil(igsid: string): Promise<{ nombre?: string; usuario?: string }> {
    try {
      const r = await this.f(`${this.base}/${encodeURIComponent(igsid)}?fields=name,username`, {
        headers: this.auth(),
        signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      });
      if (!r.ok) return {};
      const d = (await r.json()) as { name?: string; username?: string };
      return { ...(d.name ? { nombre: d.name } : {}), ...(d.username ? { usuario: d.username } : {}) };
    } catch {
      return {};
    }
  }
}
