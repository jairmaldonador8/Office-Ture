import {
  type EcoHumano,
  type EventoCanal,
  idEvento,
  type MensajeEntrante,
  type TipoMensaje,
} from "../canales/tipos.js";
import { esDueno } from "../config.js";
import type { Conversacion, Mensaje } from "../datos/tipos.js";
import { horas } from "../hora.js";
import { AYUDA_COMANDOS, parsearComando } from "./comandos.js";
import type { Deps } from "./deps.js";
import { referenciaCliente } from "./escalar.js";

/** Espera tras el último mensaje del cliente antes de contestar, para juntar ráfagas. */
const DEBOUNCE_MS = 4000;
/** Cuánto se calla el asistente después de que Bryan escribe desde su app. */
const HUMANO_MS = horas(12);
/** Un eco se compara con los envíos pendientes del bot de los últimos 2 minutos. */
const VENTANA_ECO_MS = 2 * 60_000;
const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
};

/** Procesa eventos en orden; un evento que falla queda marcado con su error y no detiene a los demás. */
export async function procesarLote(eventos: EventoCanal[], d: Deps): Promise<void> {
  for (const ev of eventos) {
    const id = idEvento(ev);
    try {
      await procesarEvento(ev, d);
      await d.repo.marcarEventoProcesado(id);
    } catch (e) {
      console.error("evento", id, e);
      // El evento queda pendiente y el cron lo reintenta; si ni esto se puede guardar, se sigue.
      await d.repo
        .marcarEventoProcesado(id, e instanceof Error ? e.message : String(e))
        .catch((e2: unknown) => console.error("evento sin marcar", id, e2));
    }
  }
}

export async function procesarEvento(ev: EventoCanal, d: Deps): Promise<void> {
  if (ev.clase === "eco") return procesarEco(ev.e, d);
  if (ev.m.canal === "whatsapp" && esDueno(d.config, ev.m.de)) return procesarDueno(ev.m, d);
  return procesarCliente(ev.m, d);
}

async function procesarCliente(m: MensajeEntrante, d: Deps): Promise<void> {
  const ahora = d.ahora();
  let contacto = await d.repo.contactoPorExterno(m.canal, m.de);
  if (!contacto) {
    const perfil =
      m.canal === "instagram" && d.perfilInstagram ? await d.perfilInstagram(m.de).catch(() => ({})) : {};
    contacto = await d.repo.crearContacto({
      canal: m.canal,
      idExterno: m.de,
      ...(m.canal === "whatsapp" ? { telefono: m.de } : {}),
      ...(m.nombre ? { nombre: m.nombre } : {}),
      ...perfil,
    });
  } else if (m.nombre && !contacto.nombre) {
    await d.repo.actualizarContacto(contacto.id, { nombre: m.nombre });
  }
  const conv =
    (await d.repo.conversacionDeContacto(contacto.id)) ??
    (await d.repo.crearConversacion(contacto.id, m.canal));

  // En un reintento el mensaje ya quedó guardado: no se vuelve a descargar ni a transcribir.
  if (!(await d.repo.existeMensajeExterno(m.idExterno))) {
    const { texto, adjunto } = await prepararAdjunto(m, conv.id, d);
    await d.repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: conv.hilo,
      autor: "cliente",
      tipo: m.tipo,
      ...(texto ? { texto } : {}),
      ...(adjunto ? { adjunto } : {}),
      idExterno: m.idExterno,
    });
  }

  // La hora del mensaje, no la del proceso: un reintento tardío no debe correr la ventana de 24 h.
  const enviado = fechaValida(m.fecha);
  const cuando = enviado && enviado < ahora ? enviado : ahora;
  const cambios: Partial<Conversacion> = { ultimoCliente: cuando, toques: 0 };
  if (!conv.primerCliente) cambios.primerCliente = cuando;
  if (!conv.referencia && m.referencia) cambios.referencia = m.referencia;
  if (conv.modo === "bot" || conv.modo === "esperando_humano")
    cambios.responderEn = new Date(ahora.getTime() + DEBOUNCE_MS);
  await d.repo.actualizarConversacion(conv.id, cambios);
  await d.repo.cancelarSeguimientos(conv.id);
}

/**
 * Descarga de inmediato la imagen o el audio (las URL de WhatsApp vencen en 5 minutos),
 * lo guarda en el almacén y, si es audio, lo transcribe. Nunca lanza: si falla deja una nota.
 */
async function prepararAdjunto(
  m: MensajeEntrante,
  conversacionId: string,
  d: Deps,
): Promise<{ texto?: string; adjunto?: Mensaje["adjunto"] }> {
  const texto = m.texto;
  if ((m.tipo !== "imagen" && m.tipo !== "audio") || !(m.mediaId || m.mediaUrl)) return { texto };
  try {
    const media = await d.enviadores[m.canal].descargarMedia({
      ...(m.mediaId ? { mediaId: m.mediaId } : {}),
      ...(m.mediaUrl ? { mediaUrl: m.mediaUrl } : {}),
    });
    const mime = (m.mime ?? media.mime).split(";")[0]?.trim() || "application/octet-stream";
    const ruta = `${conversacionId}/${m.idExterno.replace(/[^\w.-]/g, "_")}.${EXTENSION[mime] ?? "bin"}`;
    await d.almacen.guardar(ruta, media.bytes, mime);
    const adjunto = { ruta, mime };
    if (m.tipo === "imagen") return { texto, adjunto };
    const t = d.transcribir ? await d.transcribir(media.bytes, mime).catch(() => "") : "";
    return {
      texto: t
        ? `[audio] ${t}`
        : "[el cliente mandó un audio que no se pudo transcribir; pídele que lo escriba]",
      adjunto,
    };
  } catch (e) {
    console.error("adjunto", m.idExterno, e);
    const cual = m.tipo === "imagen" ? "la imagen" : "el audio";
    return { texto: `${texto ?? ""} [no se pudo descargar ${cual}]`.trim() };
  }
}

/**
 * Eco de un mensaje que salió del número o la cuenta del negocio. Si es un envío del propio
 * bot (ya guardado con su id, o en Instagram pendiente con el mismo contenido) se ignora; si
 * no, lo mandó Bryan desde su app y el asistente se calla 12 h. Los cambios de estado van
 * antes de guardar el mensaje y son idempotentes, así un reintento siempre los completa.
 * Una edición de Bryan en WhatsApp se guarda como nota con el texto nuevo; un borrado solo
 * cuenta como actividad de Bryan (no se guarda mensaje ni se toca el original).
 */
async function procesarEco(e: EcoHumano, d: Deps): Promise<void> {
  const previo = await d.repo.mensajePorExterno(e.idExterno);
  if (previo && previo.autor !== "humano") return;

  const contacto = await d.repo.contactoPorExterno(e.canal, e.para);
  const conv = contacto
    ? await d.repo.conversacionDeContacto(contacto.id)
    : e.canal === "whatsapp"
      ? await d.repo.conversacionPorReferencia(e.para)
      : null;
  if (!conv) {
    console.warn("eco sin conversación", e.canal, enmascarar(e.para));
    return;
  }

  const ahora = d.ahora();
  // Solo Instagram: según la documentación de Meta, el webhook `smb_message_echoes` de
  // WhatsApp solo llega por mensajes enviados desde la app de WhatsApp Business o un
  // dispositivo vinculado, nunca por envíos de la Cloud API. Un eco de WhatsApp sin id
  // guardado es siempre de Bryan, aunque su texto sea igual a un envío pendiente del bot.
  if (!previo && e.canal === "instagram") {
    const enviado = fechaValida(e.fecha) ?? ahora;
    const propio = await d.repo.botPendienteParaEco(
      conv.id,
      { ...(e.texto ? { texto: e.texto } : {}), esImagen: e.tipo === "imagen" },
      new Date(Math.min(enviado.getTime(), ahora.getTime()) - VENTANA_ECO_MS),
    );
    if (propio) {
      await d.repo.asignarIdExterno(propio.id, e.idExterno);
      return;
    }
  }

  if (conv.modo !== "pausado") {
    await d.repo.actualizarConversacion(conv.id, {
      modo: "humano",
      modoHasta: new Date(ahora.getTime() + HUMANO_MS),
      motivoModo: "bryan_escribio",
      responderEn: undefined,
    });
  }
  await d.repo.atenderAlertas(conv.id, ahora);
  await d.repo.cancelarSeguimientos(conv.id);
  if (previo || e.accion === "borrado") return;
  const tipo = e.tipo ?? "texto";
  const texto =
    e.accion === "editado"
      ? `[Bryan editó un mensaje]${e.texto ? ` ${e.texto}` : ""}`
      : (e.texto ?? NOTA_ECO[tipo] ?? "");
  await d.repo.guardarMensaje({
    conversacionId: conv.id,
    hilo: conv.hilo,
    autor: "humano",
    tipo,
    texto,
    idExterno: e.idExterno,
  });
}

const NOTA_ECO: Partial<Record<TipoMensaje, string>> = {
  imagen: "[Bryan envió una imagen]",
  audio: "[Bryan envió un audio]",
  otro: "[Bryan envió un adjunto]",
};

const fechaValida = (iso: string): Date | undefined => {
  const f = new Date(iso);
  return iso && Number.isFinite(f.getTime()) ? f : undefined;
};

/** Teléfono o IGSID con solo los últimos 4 caracteres visibles, para los registros. */
const enmascarar = (id: string): string => `***${id.slice(-4)}`;

async function procesarDueno(m: MensajeEntrante, d: Deps): Promise<void> {
  await d.repo.registrarVentanaDueno(m.de, d.ahora());
  const cmd = parsearComando(m.texto ?? "");
  if (!cmd) return;
  const contestar = async (t: string) => {
    await d.enviadores.whatsapp.texto(m.de, t);
  };
  if (cmd.tipo === "ayuda" || cmd.tipo === "desconocido") return contestar(AYUDA_COMANDOS);

  let conv: Conversacion | null = null;
  if (m.citaId) {
    const alerta = await d.repo.alertaPorExterno(m.citaId);
    if (alerta) conv = await d.repo.obtenerConversacion(alerta.conversacionId);
  }
  if (!conv && cmd.ref) conv = await d.repo.conversacionPorReferencia(cmd.ref);
  if (!conv)
    return contestar(
      "No encontré esa conversación. Responde citando la alerta, o manda el comando con el teléfono o el @usuario del cliente.",
    );

  const contacto = await d.repo.obtenerContacto(conv.contactoId);
  const quien = contacto.nombre ?? referenciaCliente(contacto);
  const ahora = d.ahora();
  switch (cmd.tipo) {
    case "bot":
      await d.repo.actualizarConversacion(conv.id, {
        modo: "bot",
        modoHasta: undefined,
        motivoModo: undefined,
        avisoEsperaEnviado: false,
      });
      await d.repo.atenderAlertas(conv.id, ahora);
      return contestar(`Listo, el asistente vuelve a atender a ${quien}.`);
    case "pausa":
      await d.repo.actualizarConversacion(conv.id, {
        modo: "pausado",
        modoHasta: undefined,
        responderEn: undefined,
      });
      await d.repo.cancelarSeguimientos(conv.id);
      return contestar(`Listo, el asistente queda en pausa con ${quien} hasta que mandes /bot.`);
    case "ganado":
      await d.repo.actualizarConversacion(conv.id, { estado: "ganado" });
      await d.repo.cancelarSeguimientos(conv.id);
      await d.repo.atenderAlertas(conv.id, ahora);
      return contestar(`Anotado: venta cerrada con ${quien}.`);
    case "perdido":
      await d.repo.actualizarConversacion(conv.id, { estado: "perdido" });
      if (cmd.motivo) await d.repo.actualizarLead(conv.id, { motivoPerdida: cmd.motivo });
      await d.repo.cancelarSeguimientos(conv.id);
      await d.repo.atenderAlertas(conv.id, ahora);
      return contestar(`Anotado: venta perdida con ${quien}.`);
  }
}
