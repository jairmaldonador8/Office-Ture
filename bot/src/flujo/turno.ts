import type { ContextoHerramientas, Escalacion } from "../cerebro/herramientas.js";
import { aMensajesClaude, type ImagenLista } from "../cerebro/historial.js";
import { sistemaDinamico, sistemaEstatico } from "../cerebro/prompt.js";
import {
  ErrorRespuesta,
  type ModeloCliente,
  opcionesHasta,
  PRESUPUESTO_TURNO_MS,
  type ResultadoRespuesta,
  responder,
  resumirHilo,
  type Uso,
} from "../cerebro/responder.js";
import type { Contacto, Conversacion, Mensaje } from "../datos/tipos.js";
import { horas } from "../hora.js";
import { errorSeguro } from "../log.js";
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

/** Marca con el último mensaje del cliente que tenía en cuenta la respuesta descartada por vieja. */
const marcaDescarte = (conversacionId: string) => `turno_descartado:${conversacionId}`;

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
      console.error("imagen del cliente", m.id, errorSeguro(e));
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
  limite: number,
): Promise<{ conv: Conversacion; mensajes: Mensaje[] }> {
  if (mensajes.length <= MAX_MENSAJES_HILO) return { conv, mensajes };
  const transcripcion = [
    ...(conv.resumenHilo ? [`Resumen anterior: ${conv.resumenHilo}`] : []),
    ...mensajes.map((m) => `${m.autor}: ${m.texto ?? `[${m.tipo}]`}`),
  ].join("\n");
  // El resumen pasa por un modelo que suma el uso, para registrarlo igual que las respuestas.
  const uso: Uso = { entrada: 0, salida: 0, cache: 0 };
  const medido: ModeloCliente = {
    crear: async (p, o) => {
      const r = await d.modelo.crear(p, o);
      uso.entrada += r.usage?.input_tokens ?? 0;
      uso.salida += r.usage?.output_tokens ?? 0;
      uso.cache += r.usage?.cache_read_input_tokens ?? 0;
      return r;
    },
  };
  const inicio = Date.now();
  const registrar = (error?: string) =>
    d.repo.registrarLlamadaModelo({
      conversacionId: conv.id,
      modelo: d.config.CLAUDE_MODEL,
      tokensEntrada: uso.entrada,
      tokensSalida: uso.salida,
      tokensCache: uso.cache,
      herramientas: [],
      latenciaMs: Date.now() - inicio,
      ...(error ? { error } : {}),
    });
  let resumen: string;
  try {
    const opciones = opcionesHasta(limite, relojDe(d));
    if (!opciones) throw new Error("sin tiempo para resumir");
    resumen = await resumirHilo(medido, d.config.CLAUDE_MODEL, transcripcion, opciones);
  } catch (e) {
    console.error("resumen de hilo", conv.id, errorSeguro(e));
    await registrar(`resumen: ${e instanceof Error ? e.message : String(e)}`);
    return { conv, mensajes };
  }
  await registrar();
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

/** El presupuesto del turno se mide con el reloj de las dependencias (falso en pruebas). */
const relojDe = (d: Deps) => () => d.ahora().getTime();

async function turno(conversacionId: string, d: Deps): Promise<void> {
  // El presupuesto de Claude cuenta desde que empieza el turno: incluye el resumen del hilo.
  const limite = d.ahora().getTime() + PRESUPUESTO_TURNO_MS;
  const inicial = await d.repo.obtenerConversacion(conversacionId);
  const leidos = await d.repo.mensajesDelHilo(inicial.id, inicial.hilo);
  const ultimo = ultimoVisible(leidos);
  // Turno retomado tras una caída entre el envío y el cierre: la respuesta ya salió (su fila
  // es la última) pero ultimoBot no se actualizó. Se completa el cierre sin llamar al modelo
  // ni volver a enviar. La escalación, si la hubo, ya quedó guardada antes del envío.
  if (ultimo?.autor === "bot" && (!inicial.ultimoBot || ultimo.creado > inicial.ultimoBot)) {
    await cerrarTurno(inicial, ultimo.creado, d);
    return;
  }
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
        console.error("aviso de espera", inicial.id, errorSeguro(e));
      }
    }
    return;
  }
  if (inicial.modo !== "bot") return;

  const { conv, mensajes } = await rotarHilo(inicial, leidos, d, limite);
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
      mensajes: aMensajesClaude(mensajes, imagenes, d.ahora()),
      ctx,
      reloj: relojDe(d),
      limite,
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

  const vistos = new Set(mensajes.map((m) => m.id));
  const nuevos = (await d.repo.mensajesDelHilo(conv.id, conv.hilo)).filter((m) => !vistos.has(m.id));
  // Si Bryan escribió desde su app mientras Claude pensaba, el eco ya puso el modo humano:
  // él atiende y no se manda nada ni se programa seguimiento.
  const actual = await d.repo.obtenerConversacion(conv.id);
  if (actual.modo !== "bot" || nuevos.some((m) => m.autor === "humano")) return;

  // Si el cliente escribió mientras Claude pensaba, la respuesta ya quedó vieja: no se manda y
  // el turno siguiente (responder_en ya quedó fijado) contesta todo junto. Dos excepciones:
  // - Claude escaló: la despedida y la alerta salen igual, así la escalación no se pierde.
  // - Ya se descartó una respuesta seguida (la marca apunta a un mensaje del cliente que sigue
  //   sin respuesta): esta sale, para que un cliente que escribe sin parar no se quede sin
  //   contestar. Su fila se fecha justo después de lo que vio el modelo, antes del mensaje
  //   nuevo, y así ese mensaje recibe su propio turno.
  let creado: Date | undefined;
  if (!ctx.escalacion && nuevos.some((m) => m.autor === "cliente")) {
    if (!(await yaSeDescartoUna(conv.id, mensajes, d))) {
      await d.repo.escribirMarca(marcaDescarte(conv.id), ultimo.id);
      return;
    }
    const base = mensajes.at(-1)?.creado ?? ultimo.creado;
    creado = new Date(base.getTime() + 1);
  }
  let orden = 0;
  const fecha = () => (creado ? { creado: new Date(creado.getTime() + orden++) } : {});

  // La escalación se guarda (y Bryan recibe la alerta) antes de mandar la despedida: si el
  // proceso muere después de enviar, el turno retomado no tiene cómo recuperarla. Enviar al
  // cliente no depende del modo, así que esperando_humano no bloquea la despedida.
  if (ctx.escalacion) await ejecutarEscalacion(conv.id, ctx.escalacion, d);

  for (const foto of ctx.fotos.slice(0, MAX_FOTOS)) {
    try {
      await enviarAlCliente(
        d,
        conv,
        contacto,
        { tipo: "imagen", url: foto.url, pie: foto.pie },
        { intentos: INTENTOS_ENVIO, ...fecha() },
      );
    } catch (e) {
      console.error("foto", conv.id, errorSeguro(e));
    }
  }
  try {
    await enviarAlCliente(
      d,
      conv,
      contacto,
      { tipo: "texto", texto: r.texto },
      { intentos: INTENTOS_ENVIO, ...fecha() },
    );
  } catch (e) {
    console.error("respuesta", conv.id, errorSeguro(e));
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

  await cerrarTurno(conv, d.ahora(), d);
}

/**
 * Cierre tras enviar: fija ultimoBot, abre la ventana gratuita de 72 h si es la primera
 * respuesta a un cliente de anuncio y programa el siguiente toque (ninguno si se escaló:
 * el modo ya es esperando_humano). Idempotente, para el turno retomado tras una caída.
 */
async function cerrarTurno(conv: Conversacion, cuando: Date, d: Deps): Promise<void> {
  const cambios: Partial<Conversacion> = { ultimoBot: cuando };
  const primerCliente = conv.primerCliente;
  const vinoDeAnuncio =
    conv.canal === "whatsapp" && conv.referencia !== undefined && primerCliente !== undefined;
  if (!conv.ultimoBot && vinoDeAnuncio && cuando.getTime() - primerCliente.getTime() < horas(24)) {
    cambios.ventanaGratisHasta = new Date(cuando.getTime() + horas(72));
  }
  await d.repo.actualizarConversacion(conv.id, cambios);
  await programarSiguiente(conv.id, d);
}

/** El turno anterior descartó su respuesta y los mensajes que tenía en cuenta siguen sin respuesta. */
async function yaSeDescartoUna(conversacionId: string, mensajes: Mensaje[], d: Deps): Promise<boolean> {
  const marca = await d.repo.leerMarca(marcaDescarte(conversacionId));
  if (!marca) return false;
  const i = mensajes.findLastIndex((m) => m.autor !== "cliente" && m.autor !== "sistema");
  return mensajes.slice(i + 1).some((m) => m.id === marca);
}

async function fallaDelModelo(conv: Conversacion, contacto: Contacto, d: Deps): Promise<void> {
  // Primero la escalación, por si el proceso muere después de la cortesía.
  await ejecutarEscalacion(
    conv.id,
    escalacionTecnica("El asistente no pudo responder. Revisa la conversación y contesta desde tu app."),
    d,
  );
  try {
    await enviarAlCliente(
      d,
      conv,
      contacto,
      { tipo: "texto", texto: CORTESIA },
      { intentos: INTENTOS_ENVIO },
    );
  } catch (e) {
    console.error("cortesía", conv.id, errorSeguro(e));
    return;
  }
  await d.repo.actualizarConversacion(conv.id, { ultimoBot: d.ahora() });
}
