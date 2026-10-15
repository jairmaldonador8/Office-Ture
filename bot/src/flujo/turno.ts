import type { ContextoHerramientas, Escalacion } from "../cerebro/herramientas.js";
import { aMensajesClaude, type ImagenLista } from "../cerebro/historial.js";
import { sistemaDinamico, sistemaEstatico } from "../cerebro/prompt.js";
import { ErrorRespuesta, type ResultadoRespuesta, responder, resumirHilo } from "../cerebro/responder.js";
import type { Contacto, Conversacion, Mensaje } from "../datos/tipos.js";
import { horas } from "../hora.js";
import type { Deps } from "./deps.js";
import { enviarAlCliente } from "./enviar.js";
import { ejecutarEscalacion } from "./escalar.js";
import { siguienteToque } from "./seguimiento.js";

const MAX_MENSAJES_HILO = 30;
const MENSAJES_QUE_PASAN_AL_NUEVO_HILO = 6;
const MAX_IMAGEN = 5 * 1024 * 1024;
/** Una burbuja de texto y, si acaso, una foto: cada mensaje cuesta. */
const MAX_FOTOS = 1;
const INTENTOS_ENVIO = 3;

const AVISO_ESPERA = "Bryan te atiende en un momento.";
const CORTESIA = "Dame un momento, en seguida te atiendo.";

const escalacionTecnica = (resumen: string): Escalacion => ({
  motivo: "error_modelo",
  resumen,
  urgencia: "hoy",
  tipoCliente: "individual",
});

/** Cancela los toques pendientes y programa el siguiente según el estado actual. */
export async function programarSiguiente(conversacionId: string, d: Deps): Promise<void> {
  const conv = await d.repo.obtenerConversacion(conversacionId);
  const lead = await d.repo.obtenerLead(conversacionId);
  await d.repo.cancelarSeguimientos(conversacionId);
  if (!conv.ultimoCliente || !conv.ultimoBot) return;
  const toque = siguienteToque({
    canal: conv.canal,
    modo: conv.modo,
    estado: conv.estado,
    toques: conv.toques,
    noContactar: lead.noContactar,
    ultimoCliente: conv.ultimoCliente,
    ultimoBot: conv.ultimoBot,
    ...(conv.ventanaGratisHasta ? { ventanaGratisHasta: conv.ventanaGratisHasta } : {}),
  });
  if (toque) await d.repo.programarSeguimiento({ conversacionId, ...toque });
}

/** Imágenes del cliente desde la última intervención del negocio, en base64 para Claude. */
async function imagenesRecientes(mensajes: Mensaje[], d: Deps): Promise<Map<string, ImagenLista>> {
  const mapa = new Map<string, ImagenLista>();
  let i = mensajes.length - 1;
  while (i >= 0 && mensajes[i]?.autor === "cliente") i--;
  for (const m of mensajes.slice(i + 1)) {
    if (m.tipo !== "imagen" || !m.adjunto) continue;
    try {
      const bytes = await d.almacen.leer(m.adjunto.ruta);
      if (bytes.byteLength <= MAX_IMAGEN)
        mapa.set(m.id, { base64: Buffer.from(bytes).toString("base64"), mime: m.adjunto.mime });
    } catch (e) {
      // Sin imagen, el historial la describe con texto.
      console.error("imagen del cliente", m.id, e);
    }
  }
  return mapa;
}

const ultimoVisible = (mensajes: Mensaje[]): Mensaje | undefined =>
  mensajes.findLast((m) => m.autor !== "sistema");

/** Si el hilo pasa de 30 mensajes, lo resume y abre uno nuevo con los últimos. Si el resumen falla, sigue igual. */
async function rotarHilo(
  conv: Conversacion,
  mensajes: Mensaje[],
  d: Deps,
): Promise<{ conv: Conversacion; mensajes: Mensaje[] }> {
  if (mensajes.length <= MAX_MENSAJES_HILO) return { conv, mensajes };
  const transcripcion = [
    ...(conv.resumenHilo ? [`Resumen anterior: ${conv.resumenHilo}`] : []),
    ...mensajes.map((m) => `${m.autor}: ${m.texto ?? `[${m.tipo}]`}`),
  ].join("\n");
  const inicio = Date.now();
  let resumen: string;
  try {
    resumen = await resumirHilo(d.modelo, d.config.CLAUDE_MODEL, transcripcion);
  } catch (e) {
    console.error("resumen de hilo", conv.id, e);
    await d.repo.registrarLlamadaModelo({
      conversacionId: conv.id,
      modelo: d.config.CLAUDE_MODEL,
      tokensEntrada: 0,
      tokensSalida: 0,
      tokensCache: 0,
      herramientas: [],
      latenciaMs: Date.now() - inicio,
      error: `resumen: ${e instanceof Error ? e.message : String(e)}`,
    });
    return { conv, mensajes };
  }
  const hilo = conv.hilo + 1;
  await d.repo.moverAlHilo(conv.id, hilo, MENSAJES_QUE_PASAN_AL_NUEVO_HILO);
  await d.repo.actualizarConversacion(conv.id, { hilo, resumenHilo: resumen });
  return {
    conv: await d.repo.obtenerConversacion(conv.id),
    mensajes: await d.repo.mensajesDelHilo(conv.id, hilo),
  };
}

/**
 * Responde una conversación tomada de la cola. Al terminar (con éxito o con falla manejada)
 * libera el turno; nunca toca responder_en: si el cliente escribió durante el turno, su
 * mensaje ya lo volvió a fijar y el despachador toma el turno siguiente.
 */
export async function procesarTurno(conversacionId: string, d: Deps): Promise<void> {
  try {
    await turno(conversacionId, d);
  } finally {
    await d.repo.liberarTurno(conversacionId);
  }
}

async function turno(conversacionId: string, d: Deps): Promise<void> {
  const inicial = await d.repo.obtenerConversacion(conversacionId);
  const leidos = await d.repo.mensajesDelHilo(inicial.id, inicial.hilo);
  const ultimo = ultimoVisible(leidos);
  if (ultimo?.autor !== "cliente") return;
  const contacto = await d.repo.obtenerContacto(inicial.contactoId);

  if (inicial.modo === "esperando_humano") {
    if (!inicial.avisoEsperaEnviado) {
      try {
        await enviarAlCliente(
          d,
          inicial,
          contacto,
          { tipo: "texto", texto: AVISO_ESPERA },
          { intentos: INTENTOS_ENVIO },
        );
        await d.repo.actualizarConversacion(inicial.id, { avisoEsperaEnviado: true });
      } catch (e) {
        console.error("aviso de espera", inicial.id, e);
      }
    }
    return;
  }
  if (inicial.modo !== "bot") return;

  const { conv, mensajes } = await rotarHilo(inicial, leidos, d);
  const lead = await d.repo.obtenerLead(conv.id);
  const imagenes = await imagenesRecientes(mensajes, d);
  const primerMensajeBot = !conv.ultimoBot;
  await d.enviadores[conv.canal].escribiendo(contacto.idExterno, ultimo.idExterno).catch(() => {});

  const ctx: ContextoHerramientas = { repo: d.repo, conversacion: conv, fotos: [], resultados: [] };
  const inicio = Date.now();
  let r: ResultadoRespuesta;
  try {
    r = await responder({
      modelo: d.modelo,
      model: d.config.CLAUDE_MODEL,
      sistemaEstatico: sistemaEstatico({
        nombre: d.config.NOMBRE_ASISTENTE,
        avisoUrl: d.config.AVISO_PRIVACIDAD_URL,
      }),
      sistemaDinamico: sistemaDinamico({
        canal: conv.canal,
        ahora: d.ahora(),
        lead,
        primerMensajeBot,
        ...(conv.referencia ? { referencia: conv.referencia } : {}),
        ...(conv.resumenHilo ? { resumenHilo: conv.resumenHilo } : {}),
        ...(contacto.nombre ? { nombreCliente: contacto.nombre } : {}),
      }),
      mensajes: aMensajesClaude(mensajes, imagenes),
      ctx,
    });
  } catch (e) {
    const uso = e instanceof ErrorRespuesta ? e.uso : { entrada: 0, salida: 0, cache: 0 };
    await d.repo.registrarLlamadaModelo({
      conversacionId: conv.id,
      modelo: d.config.CLAUDE_MODEL,
      tokensEntrada: uso.entrada,
      tokensSalida: uso.salida,
      tokensCache: uso.cache,
      herramientas: e instanceof ErrorRespuesta ? e.herramientas : [],
      latenciaMs: Date.now() - inicio,
      error: e instanceof Error ? e.message : String(e),
    });
    await fallaDelModelo(conv, contacto, d);
    return;
  }
  await d.repo.registrarLlamadaModelo({
    conversacionId: conv.id,
    modelo: d.config.CLAUDE_MODEL,
    tokensEntrada: r.uso.entrada,
    tokensSalida: r.uso.salida,
    tokensCache: r.uso.cache,
    herramientas: r.herramientas,
    latenciaMs: Date.now() - inicio,
  });

  // Si el cliente escribió mientras Claude pensaba, la respuesta ya quedó vieja: no se manda y
  // el turno siguiente (responder_en ya quedó fijado) contesta todo junto. Si se mandara, su
  // fila quedaría después del mensaje nuevo y ese mensaje se quedaría sin respuesta.
  if (await llegoOtroMensaje(conv, mensajes, d)) return;

  for (const foto of ctx.fotos.slice(0, MAX_FOTOS)) {
    try {
      await enviarAlCliente(
        d,
        conv,
        contacto,
        { tipo: "imagen", url: foto.url, pie: foto.pie },
        { intentos: INTENTOS_ENVIO },
      );
    } catch (e) {
      console.error("foto", conv.id, e);
    }
  }
  try {
    await enviarAlCliente(d, conv, contacto, { tipo: "texto", texto: r.texto }, { intentos: INTENTOS_ENVIO });
  } catch (e) {
    console.error("respuesta", conv.id, e);
    await ejecutarEscalacion(
      conv.id,
      ctx.escalacion ??
        escalacionTecnica(
          "No se pudo enviar la respuesta del asistente. Revisa la conversación y contesta desde tu app.",
        ),
      d,
    );
    return;
  }

  const ahora = d.ahora();
  const cambios: Partial<Conversacion> = { ultimoBot: ahora };
  const primerCliente = conv.primerCliente;
  const vinoDeAnuncio =
    conv.canal === "whatsapp" && conv.referencia !== undefined && primerCliente !== undefined;
  if (primerMensajeBot && vinoDeAnuncio && ahora.getTime() - primerCliente.getTime() < horas(24)) {
    cambios.ventanaGratisHasta = new Date(ahora.getTime() + horas(72));
  }
  await d.repo.actualizarConversacion(conv.id, cambios);

  if (ctx.escalacion) await ejecutarEscalacion(conv.id, ctx.escalacion, d);
  else await programarSiguiente(conv.id, d);
}

async function llegoOtroMensaje(conv: Conversacion, vistos: Mensaje[], d: Deps): Promise<boolean> {
  const ids = new Set(vistos.map((m) => m.id));
  const ahora = await d.repo.mensajesDelHilo(conv.id, conv.hilo);
  return ahora.some((m) => m.autor === "cliente" && !ids.has(m.id));
}

async function fallaDelModelo(conv: Conversacion, contacto: Contacto, d: Deps): Promise<void> {
  try {
    await enviarAlCliente(
      d,
      conv,
      contacto,
      { tipo: "texto", texto: CORTESIA },
      { intentos: INTENTOS_ENVIO },
    );
  } catch (e) {
    console.error("cortesía", conv.id, e);
  }
  await ejecutarEscalacion(
    conv.id,
    escalacionTecnica("El asistente no pudo responder. Revisa la conversación y contesta desde tu app."),
    d,
  );
}
