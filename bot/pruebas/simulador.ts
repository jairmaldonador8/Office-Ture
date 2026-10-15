/**
 * Corre las conversaciones guionizadas por el flujo real (entrada, cola de turnos, turno) con
 * repositorio en memoria, envíos falsos y Claude real; no toca Meta. Guarda cada transcripción
 * con sus rúbricas en pruebas/transcripciones/ (fuera de git).
 *
 *   npm run simular                 todos los escenarios
 *   npm run simular -- silla-ergo   solo uno
 *   CLAUDE_MODEL=claude-haiku-5-5 npm run simular
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EventoCanal } from "../src/canales/tipos.js";
import { type ModeloCliente, modeloAnthropic } from "../src/cerebro/responder.js";
import { procesarEvento } from "../src/flujo/entrada.js";
import { procesarTurno } from "../src/flujo/turno.js";
import { aLocal } from "../src/hora.js";
import { mapearHoja } from "../src/negocio/hoja.js";
import { ESCENARIOS, type Escenario } from "./escenarios.js";
import { ENCABEZADO, FILAS } from "./inventario.js";
import { type Hallazgo, revisarAviso, revisarTexto, revisarTurno } from "./revisar.js";
import { depsDePrueba, mensajeWa } from "./unitarias/apoyo.js";

const CLIENTE = "5218112345678";
/** Primer dueño de DUENOS en la config de prueba: manda los comandos desde su número personal. */
const DUENO = "5218111111111";
/** PNG de 1x1 píxel para el paso `foto`: lo bastante válido para que Claude real lo acepte. */
export const PNG_MINIMO = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
/** Más que el debounce de 4 s de la entrada, para que el turno ya esté vencido. */
const PASO_COLA_MS = 5_000;
const ENTRE_MENSAJES_MS = 60_000;

/** Productos de la hoja real, cargados igual que la sincronización. */
export function productosDeLaHoja() {
  const { productos, errores } = mapearHoja([ENCABEZADO, ...FILAS]);
  const graves = errores.filter((e) => !e.startsWith("Aviso:"));
  if (graves.length > 0) throw new Error(`La copia de la hoja tiene errores:\n${graves.join("\n")}`);
  return productos;
}

export interface ResultadoEscenario {
  transcripcion: string;
  hallazgos: Hallazgo[];
}

export async function correr(
  e: Escenario,
  modelo: ModeloCliente,
  opciones: { claudeModel?: string } = {},
): Promise<ResultadoEscenario> {
  const { deps, repo, wa, reloj } = depsDePrueba({ modelo });
  if (opciones.claudeModel) deps.config = { ...deps.config, CLAUDE_MODEL: opciones.claudeModel };
  wa.descargarMedia = async () => ({ bytes: PNG_MINIMO, mime: "image/png" });
  const productos = productosDeLaHoja();
  await repo.sincronizarProductos(productos);
  if (e.inicio) reloj.fijar(aLocal(...e.inicio));

  const transcripcion: string[] = [`# ${e.nombre}`, "", `Modelo: ${deps.config.CLAUDE_MODEL}`, ""];
  const hallazgos: Hallazgo[] = [];
  let ecos = 0;
  let enviadosAntesDeBryan: number | undefined;
  let alClienteAlComando: number | undefined;
  const alClienteHasta = () =>
    wa.enviados.filter((env) => env.para === CLIENTE && env.tipo !== "escribiendo").length;

  for (const [i, paso] of e.mensajes.entries()) {
    const antes = wa.enviados.length;
    let ev: EventoCanal;
    if (typeof paso === "string") {
      transcripcion.push(`**Cliente:** ${paso}`, "");
      ev = mensajeWa(paso, {
        fecha: deps.ahora().toISOString(),
        ...(i === 0 && e.referencia ? { referencia: e.referencia } : {}),
      });
    } else if ("foto" in paso) {
      transcripcion.push(`**Cliente** (foto): ${paso.foto || "(sin texto)"}`, "");
      ev = mensajeWa(paso.foto, {
        fecha: deps.ahora().toISOString(),
        tipo: "imagen",
        mediaId: `media.${i + 1}`,
        mime: "image/png",
      });
    } else if ("dueno" in paso) {
      transcripcion.push(`**Dueño (comando):** ${paso.dueno}`, "");
      ev = mensajeWa(paso.dueno, { de: DUENO, nombre: "Bryan", fecha: deps.ahora().toISOString() });
    } else {
      transcripcion.push(`**Bryan (desde su app):** ${paso.bryan}`, "");
      ev = {
        clase: "eco",
        e: {
          canal: "whatsapp",
          idExterno: `wamid.bryan.${++ecos}`,
          para: CLIENTE,
          texto: paso.bryan,
          fecha: deps.ahora().toISOString(),
        },
      };
      enviadosAntesDeBryan ??= antes;
    }
    await procesarEvento(ev, deps);

    // Como el despachador: espera el debounce y toma los turnos vencidos.
    reloj.avanzar(PASO_COLA_MS);
    for (const id of await repo.tomarTurnos(deps.ahora(), 10)) await procesarTurno(id, deps);

    const nuevos = wa.enviados.slice(antes).filter((env) => env.tipo !== "escribiendo");
    for (const env of nuevos) {
      const quien = env.para === CLIENTE ? "Asistente" : "Alerta a dueño";
      const cuerpo =
        env.tipo === "imagen"
          ? `${env.url}${env.texto ? ` · ${env.texto}` : ""}`
          : (env.texto ?? env.plantilla ?? "");
      transcripcion.push(`**${quien}** (${env.tipo}): ${cuerpo}`, "");
    }
    const alCliente = nuevos.filter((env) => env.para === CLIENTE);
    if (alCliente.length > 0)
      hallazgos.push({ ...revisarTurno(alCliente), regla: `una_burbuja#paso${i + 1}` });
    if (typeof paso === "object" && "dueno" in paso) alClienteAlComando = alClienteHasta();
    reloj.avanzar(ENTRE_MENSAJES_MS);
  }

  const contacto = await repo.contactoPorExterno("whatsapp", CLIENTE);
  const conv = contacto ? await repo.conversacionDeContacto(contacto.id) : null;
  if (!conv) throw new Error(`El escenario ${e.nombre} no creó conversación`);
  const lead = await repo.obtenerLead(conv.id);
  const textosBot = wa.textos(CLIENTE);
  const herramientas = repo.llamadas.flatMap((l) => l.herramientas);
  const precios = productos.map((p) => p.precio);
  const esp = e.espera;

  if (textosBot.length === 0 && !esp.callaTrasBryan)
    hallazgos.push({ regla: "responde", ok: false, detalle: "el asistente no mandó ningún texto" });
  for (const [i, t] of textosBot.entries())
    for (const h of revisarTexto(t, precios, {
      ...(e.montosPermitidos ? { montosPermitidos: e.montosPermitidos } : {}),
      ...(e.presupuestoCliente ? { presupuestoCliente: e.presupuestoCliente } : {}),
    }))
      hallazgos.push({ ...h, regla: `${h.regla}#${i + 1}` });
  if (esp.escalar)
    hallazgos.push({
      regla: "escala_con_motivo",
      ok: lead.motivoEscalacion === esp.escalar,
      detalle: `esperado ${esp.escalar}, obtenido ${lead.motivoEscalacion ?? "ninguno"}`,
    });
  if (esp.sinEscalar)
    hallazgos.push({ regla: "no_escala", ok: !lead.motivoEscalacion, detalle: lead.motivoEscalacion ?? "" });
  if (esp.marcador)
    hallazgos.push({
      regla: "marcador",
      ok: lead.motivosPrioridad.includes(esp.marcador),
      detalle: `esperado ${esp.marcador}, obtenido ${lead.motivosPrioridad.join(", ") || "ninguno"}`,
    });
  for (const h of esp.herramientas ?? [])
    hallazgos.push({ regla: `usa_${h}`, ok: herramientas.includes(h), detalle: herramientas.join(", ") });
  if (esp.textoIncluye) {
    const buscado = esp.textoIncluye.toLowerCase();
    hallazgos.push({ regla: "texto_incluye", ok: textosBot.some((t) => t.toLowerCase().includes(buscado)) });
  }
  if (esp.incluyeTodos) {
    const todos = esp.incluyeTodos;
    const pregunta = (t: string) => !esp.preguntaCual || /cu[aá]l|\?/i.test(t);
    hallazgos.push({
      regla: "incluye_todos",
      ok: textosBot.some((t) => todos.every((x) => t.toLowerCase().includes(x.toLowerCase())) && pregunta(t)),
      detalle: todos.join(" y ") + (esp.preguntaCual ? " y pregunta cuál" : ""),
    });
  }
  if (esp.callaTrasBryan) {
    const despues = wa.enviados
      .slice(enviadosAntesDeBryan ?? wa.enviados.length)
      .filter((env) => env.para === CLIENTE && env.tipo !== "escribiendo");
    hallazgos.push({
      regla: "calla_tras_bryan",
      ok: enviadosAntesDeBryan !== undefined && despues.length === 0,
      detalle: `${despues.length} envíos al cliente después del eco`,
    });
  }
  if (esp.respondeTrasBot) {
    const despues = alClienteHasta() - (alClienteAlComando ?? Number.POSITIVE_INFINITY);
    hallazgos.push({
      regla: "responde_tras_bot",
      ok: alClienteAlComando !== undefined && despues > 0,
      detalle: `${alClienteAlComando === undefined ? "sin comando" : `${despues} envíos al cliente tras /bot`}`,
    });
  }
  const aviso = revisarAviso(textosBot, deps.config.AVISO_PRIVACIDAD_URL);
  if (aviso) hallazgos.push(aviso);
  if (lead.nombre || lead.direccion)
    hallazgos.push({
      regla: "aviso_registrado",
      ok: lead.avisoEnviado && textosBot.some((t) => t.includes(deps.config.AVISO_PRIVACIDAD_URL)),
    });

  return { transcripcion: transcripcion.join("\n"), hallazgos };
}

const lineaRubrica = (h: Hallazgo) =>
  `- ${h.ok ? "ok" : "FALLA"} ${h.regla}${h.detalle ? ` (${h.detalle})` : ""}`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY");
  const modelo = modeloAnthropic(apiKey);
  const claudeModel = process.env.CLAUDE_MODEL;
  const filtro = process.argv[2];
  const lista = ESCENARIOS.filter((e) => !filtro || e.nombre === filtro);
  if (lista.length === 0) throw new Error(`No hay escenario «${filtro}»`);
  const carpeta = join(
    "pruebas",
    "transcripciones",
    new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"),
  );
  await mkdir(carpeta, { recursive: true });
  let fallidos = 0;
  for (const e of lista) {
    const { transcripcion, hallazgos } = await correr(e, modelo, claudeModel ? { claudeModel } : {});
    const malos = hallazgos.filter((h) => !h.ok);
    await writeFile(
      join(carpeta, `${e.nombre}.md`),
      `${transcripcion}\n## Rúbricas\n\n${hallazgos.map(lineaRubrica).join("\n")}\n`,
    );
    console.log(
      `${malos.length ? "FALLA" : "ok   "} ${e.nombre}${malos.length ? `: ${malos.map((h) => h.regla).join(", ")}` : ""}`,
    );
    if (malos.length) fallidos++;
  }
  console.log(`\n${lista.length - fallidos}/${lista.length} escenarios pasan. Transcripciones en ${carpeta}`);
  process.exitCode = fallidos ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
