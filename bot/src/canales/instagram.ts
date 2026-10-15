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
    fecha: new Date(ev.timestamp).toISOString(),
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
  const p = payload as { object?: string; entry?: { messaging?: IgEvento[] }[] } | null;
  if (p?.object !== "instagram") return [];
  const eventos: EventoCanal[] = [];
  for (const entrada of p.entry ?? []) {
    for (const ev of entrada.messaging ?? []) {
      const m = ev.message;
      if (!m || m.is_deleted) continue;
      if (m.is_echo) {
        const eco = {
          canal: "instagram" as const,
          idExterno: m.mid,
          para: ev.recipient.id,
          fecha: new Date(ev.timestamp).toISOString(),
        };
        eventos.push({ clase: "eco", e: m.text ? { ...eco, texto: m.text } : eco });
        continue;
      }
      if (ev.sender.id === igUserId) continue;
      eventos.push({ clase: "mensaje", m: mensaje(ev, m) });
    }
  }
  return eventos;
}
