import { esFueraDeVentana } from "../canales/tipos.js";
import { duenos } from "../config.js";
import type { Contacto, Conversacion, Seguimiento } from "../datos/tipos.js";
import { enHorario, horas, local } from "../hora.js";
import { enmascararId, errorSeguro } from "../log.js";
import type { Deps } from "./deps.js";
import { procesarLote } from "./entrada.js";
import { enviarAlCliente } from "./enviar.js";
import { enviarADueno } from "./escalar.js";
import { etiquetaMotivo, textoVencimiento } from "./motivos.js";
import { procesarTurno, programarSiguiente } from "./turno.js";

/** Un toque que se repite se ve como envío masivo: un reintento corto y nada más. */
const INTENTOS_TOQUE = 2;
const ESTADOS_CON_SEGUIMIENTO = new Set(["nuevo", "calificado", "cotizado"]);

/**
 * Cuerpo de cada plantilla tal como se registra en Meta; se guarda en el historial para que Claude sepa qué se dijo.
 * Tienen que coincidir palabra por palabra con las plantillas aprobadas en Meta: si cambia una, se cambian las dos.
 */
const PLANTILLAS_SEGUIMIENTO = {
  seguimiento_precio:
    "Hola, te escribo de OfficeTure sobre la cotización que te pasamos. ¿Te gustaría avanzar o prefieres que te mande otra opción según tu presupuesto?",
  seguimiento_revision:
    "Hola, te escribo de OfficeTure para dar seguimiento a tu cotización de mobiliario. Si todavía lo necesitas, responde este mensaje y te ayudo.",
} as const;

/** Respaldo del despachador de pg_cron: toma los turnos vencidos y los procesa. */
export async function despacharTurnos(d: Deps, limite = 5): Promise<number> {
  const ids = await d.repo.tomarTurnos(d.ahora(), limite);
  await Promise.allSettled(
    ids.map(async (id) => {
      try {
        // procesarTurno libera el turno al terminar, aun si falla.
        await procesarTurno(id, d);
      } catch (e) {
        console.error("turno", id, errorSeguro(e));
      }
    }),
  );
  return ids.length;
}

export function textoSeguimiento(estado: string, tipo: "toque1" | "toque2"): string {
  if (tipo === "toque1") {
    if (estado === "cotizado")
      return "¿Te gustaría avanzar con este modelo o prefieres que te pase otra opción según tu presupuesto?";
    if (estado === "calificado")
      return "¿Pudiste ver las opciones? Si me confirmas cantidad y municipio te dejo la cotización lista.";
    return "Sigo por aquí para ayudarte con tu cotización. ¿Buscas escritorio, silla o archivero?";
  }
  return estado === "cotizado"
    ? "Solo para confirmar si todavía te interesa. La entrega inmediata depende de inventario y ruta, por eso conviene apartar si ya tienes modelo."
    : "Si necesitas varias piezas para tu equipo, también revisamos opciones por volumen. ¿Te ayudo con la cotización?";
}

const plantillaSeguimiento = (estado: string): keyof typeof PLANTILLAS_SEGUIMIENTO =>
  estado === "cotizado" ? "seguimiento_precio" : "seguimiento_revision";

/** Manda la plantilla de seguimiento (solo WhatsApp) y la guarda en el historial con su id. */
async function enviarPlantilla(conv: Conversacion, contacto: Contacto, d: Deps): Promise<void> {
  const nombre = plantillaSeguimiento(conv.estado);
  const id = await d.enviadores.whatsapp.plantilla(contacto.idExterno, nombre, []);
  // Los envíos de la API no producen eco: basta con guardarlo después, con su id.
  await d.repo
    .guardarMensaje({
      conversacionId: conv.id,
      hilo: conv.hilo,
      autor: "bot",
      tipo: "texto",
      texto: PLANTILLAS_SEGUIMIENTO[nombre],
      ...(id ? { idExterno: id } : {}),
    })
    .catch((e: unknown) => console.error("guardar plantilla", conv.id, errorSeguro(e)));
}

/**
 * Manda un toque. Devuelve false si el canal ya no permite escribirle (Instagram fuera de
 * ventana). En WhatsApp, si Meta rechaza el texto libre por ventana cerrada (el registro
 * local puede ir atrasado o la ventana gratuita del anuncio ya no aplica), sale una vez con plantilla.
 */
async function enviarToque(
  conv: Conversacion,
  contacto: Contacto,
  s: Seguimiento & { tipo: "toque1" | "toque2" },
  d: Deps,
): Promise<boolean> {
  if (s.usarPlantilla) {
    if (conv.canal !== "whatsapp") return false;
    await enviarPlantilla(conv, contacto, d);
    return true;
  }
  try {
    await enviarAlCliente(
      d,
      conv,
      contacto,
      { tipo: "texto", texto: textoSeguimiento(conv.estado, s.tipo) },
      { intentos: INTENTOS_TOQUE },
    );
    return true;
  } catch (e) {
    if (!esFueraDeVentana(e)) throw e;
    if (conv.canal !== "whatsapp") return false;
    await enviarPlantilla(conv, contacto, d);
    return true;
  }
}

/**
 * Despacha los toques vencidos. Cada uno se marca enviado antes de mandarse: si algo falla
 * a medias no se repite (un toque doble se percibe como envío masivo).
 */
export async function procesarSeguimientos(d: Deps): Promise<number> {
  const lista = await d.repo.tomarSeguimientos(d.ahora(), 20);
  for (const s of lista) {
    try {
      await d.repo.marcarSeguimientoEnviado(s.id, d.ahora());
      const conv = await d.repo.obtenerConversacion(s.conversacionId);
      const lead = await d.repo.obtenerLead(conv.id);
      if (conv.modo !== "bot" || lead.noContactar || !ESTADOS_CON_SEGUIMIENTO.has(conv.estado)) continue;
      if (s.tipo === "cierre") {
        await d.repo.actualizarConversacion(conv.id, { estado: "frio" });
        continue;
      }
      const contacto = await d.repo.obtenerContacto(conv.contactoId);
      if (!(await enviarToque(conv, contacto, { ...s, tipo: s.tipo }, d))) {
        // Ya no hay forma de escribirle: el lead se enfría.
        await d.repo.actualizarConversacion(conv.id, { estado: "frio" });
        await d.repo.cancelarSeguimientos(conv.id);
        continue;
      }
      await d.repo.actualizarConversacion(conv.id, { toques: conv.toques + 1, ultimoBot: d.ahora() });
      await programarSiguiente(conv.id, d);
    } catch (e) {
      console.error("seguimiento", s.id, errorSeguro(e));
    }
  }
  return lista.length;
}

/**
 * Regresa al bot las conversaciones cuyo `humano` o `esperando_humano` venció. Si el cliente
 * tiene un mensaje sin contestar (y la ventana de 24 h sigue abierta), agenda un turno para
 * responderle; si no, y la espera era por Bryan, le avisa con el texto del motivo.
 */
export async function vencerModos(d: Deps): Promise<number> {
  const ahora = d.ahora();
  const vencidas = await d.repo.conversacionesConModoVencido(ahora);
  for (const conv of vencidas) {
    try {
      const esperaba = conv.modo === "esperando_humano";
      // Otro cron traslapado ya la venció, o Bryan cambió el modo después de la consulta.
      if (!(await d.repo.tomarModoVencido(conv.id, conv.modo, ahora))) continue;
      if (esperaba) await d.repo.actualizarLead(conv.id, { escaladoSinAtender: true });
      const ventanaAbierta =
        conv.ultimoCliente !== undefined && ahora.getTime() - conv.ultimoCliente.getTime() < horas(24);
      if (!ventanaAbierta) continue;
      const mensajes = await d.repo.mensajesDelHilo(conv.id, conv.hilo);
      if (mensajes.findLast((m) => m.autor !== "sistema")?.autor === "cliente") {
        // El turno contesta lo pendiente; un aviso antes lo dejaría como contestado.
        await d.repo.actualizarConversacion(conv.id, { responderEn: ahora });
        continue;
      }
      if (!esperaba) continue;
      const contacto = await d.repo.obtenerContacto(conv.contactoId);
      await enviarAlCliente(
        d,
        conv,
        contacto,
        { tipo: "texto", texto: textoVencimiento(conv.motivoModo ?? "") },
        { intentos: INTENTOS_TOQUE },
      );
      await d.repo.actualizarConversacion(conv.id, { ultimoBot: d.ahora() });
    } catch (e) {
      console.error("vencer modo", conv.id, errorSeguro(e));
    }
  }
  return vencidas.length;
}

/**
 * En horario, una alerta sin atender a los 30 minutos se reenvía a Bryan y se copia al
 * segundo dueño, una sola vez. Las diferidas (fuera de horario) van en el resumen diario.
 */
export async function reenviarAlertas(d: Deps): Promise<number> {
  const ahora = d.ahora();
  if (!enHorario(ahora)) return 0;
  const pendientes = await d.repo.alertasParaReenviar(new Date(ahora.getTime() - 30 * 60_000));
  const destinos = duenos(d.config).slice(0, 2);
  for (const a of pendientes) {
    try {
      // Se toma antes de mandar y solo una ejecución la gana: un reenvío doble molesta más
      // que uno perdido, y el cron puede traslaparse consigo mismo.
      if (!(await d.repo.tomarAlerta(a.id))) continue;
      const conv = await d.repo.obtenerConversacion(a.conversacionId);
      if (conv.modo !== "esperando_humano") continue;
      const cliente = a.texto.split("\n")[1] ?? "";
      for (const dueno of destinos)
        await enviarADueno(
          dueno.telefono,
          `Sigue pendiente:\n${a.texto}`,
          [etiquetaMotivo(a.motivo), cliente, "Sigue pendiente de atender"],
          d,
        );
    } catch (e) {
      console.error("reenviar alerta", a.id, errorSeguro(e));
    }
  }
  return pendientes.length;
}

/** De lunes a sábado entre 9:00 y 10:00, un resumen al dueño principal si hubo pendientes. */
export async function resumenDiario(d: Deps): Promise<boolean> {
  const ahora = d.ahora();
  const l = local(ahora);
  if (l.dia === 0 || l.hora < 9 || l.hora >= 10) return false;
  const hoy = `${l.anio}-${l.mes + 1}-${l.fecha}`;
  // Solo una ejecución toma el día; si el envío falla no se repite (se registra en el log).
  if (!(await d.repo.tomarMarca("resumen_diario", hoy))) return false;
  try {
    await enviarResumen(d, ahora);
  } catch (e) {
    console.error("resumen diario", hoy, errorSeguro(e));
  }
  return true;
}

async function enviarResumen(d: Deps, ahora: Date): Promise<void> {
  const r = await d.repo.resumenDelDia(new Date(ahora.getTime() - horas(24)));
  if (!r.diferidas.length && !r.sinAtender && !r.frios) return;
  const lineas = [
    "Resumen de OfficeTure, últimas 24 horas:",
    ...(r.diferidas.length
      ? [
          `Pendientes de fuera de horario: ${r.diferidas.length}`,
          ...r.diferidas.map((a) => `· ${a.texto.split("\n")[1] ?? etiquetaMotivo(a.motivo)}`),
        ]
      : []),
    `Escalados que nadie atendió: ${r.sinAtender}`,
    `Clientes que dejaron de contestar: ${r.frios}`,
  ];
  const [principal] = duenos(d.config);
  if (!principal) return;
  const id = await enviarADueno(
    principal.telefono,
    lineas.join("\n"),
    [
      "Resumen diario",
      `${r.diferidas.length} pendientes`,
      `${r.sinAtender} sin atender y ${r.frios} sin respuesta`,
    ],
    d,
  );
  // enviarADueno no lanza: si no salió, devuelve undefined y el día ya quedó tomado.
  if (id === undefined)
    console.error("resumen diario: no se pudo enviar a", enmascararId(principal.telefono));
}

/** Eventos que el webhook guardó pero no terminó de procesar (más de un minuto). */
export async function reprocesarEventos(d: Deps): Promise<number> {
  const pendientes = await d.repo.eventosPendientes(new Date(d.ahora().getTime() - 60_000), 20);
  await procesarLote(
    pendientes.map((p) => p.evento),
    d,
  );
  return pendientes.length;
}

/** Lo que corre el cron cada minuto. Cada paso es independiente: si uno falla, los demás siguen. */
export async function ejecutarMinuto(d: Deps): Promise<Record<string, number | boolean | string>> {
  const salida: Record<string, number | boolean | string> = {};
  const pasos: [string, () => Promise<number | boolean>][] = [
    ["eventos", () => reprocesarEventos(d)],
    ["turnos", () => despacharTurnos(d)],
    ["seguimientos", () => procesarSeguimientos(d)],
    ["modos", () => vencerModos(d)],
    ["alertas", () => reenviarAlertas(d)],
    ["resumen", () => resumenDiario(d)],
  ];
  for (const [nombre, paso] of pasos) {
    try {
      salida[nombre] = await paso();
    } catch (e) {
      salida[nombre] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return salida;
}
