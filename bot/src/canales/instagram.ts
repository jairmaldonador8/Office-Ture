import type { EventoCanal, MensajeEntrante, ReferenciaAnuncio } from "./tipos.js";

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
