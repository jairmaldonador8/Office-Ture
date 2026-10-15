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

interface WaEco {
  from: string;
  to: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WaValor {
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaMensaje[];
  message_echoes?: WaEco[];
}

const iso = (ts: string): string => new Date(Number(ts) * 1000).toISOString();

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
  const p = payload as {
    object?: string;
    entry?: { changes?: { field: string; value: WaValor }[] }[];
  } | null;
  if (p?.object !== "whatsapp_business_account") return [];
  const eventos: EventoCanal[] = [];
  for (const entrada of p.entry ?? []) {
    for (const cambio of entrada.changes ?? []) {
      const v = cambio.value ?? {};
      if (cambio.field === "messages") {
        const nombres = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? [])
          eventos.push({ clase: "mensaje", m: mensaje(m, nombres.get(m.from)) });
      }
      if (cambio.field === "smb_message_echoes") {
        for (const e of v.message_echoes ?? []) {
          const eco = { canal: "whatsapp" as const, idExterno: e.id, para: e.to, fecha: iso(e.timestamp) };
          eventos.push({ clase: "eco", e: e.text?.body ? { ...eco, texto: e.text.body } : eco });
        }
      }
    }
  }
  return eventos;
}
