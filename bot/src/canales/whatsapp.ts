import type { EventoCanal, MensajeEntrante, ReferenciaAnuncio } from "./tipos.js";

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
