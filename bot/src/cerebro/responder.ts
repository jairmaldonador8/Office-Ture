import Anthropic from "@anthropic-ai/sdk";
import { type ContextoHerramientas, DEFINICIONES, ejecutarHerramienta } from "./herramientas.js";

/** Límite de cada llamada a Claude, con un solo reintento del SDK. */
export const TIEMPO_LLAMADA_MS = 25_000;
/**
 * Presupuesto de un turno con Claude. La función tiene maxDuration 120 s (vercel.json): tras
 * cortar a los 85 s queda margen para registrar el uso, escalar y mandar la cortesía.
 */
export const PRESUPUESTO_TURNO_MS = 85_000;

/** Opciones por llamada: `timeout` por intento y `signal` que corta todo, reintentos incluidos. */
export interface OpcionesLlamada {
  timeout: number;
  signal: AbortSignal;
}

export interface ModeloCliente {
  crear(p: Anthropic.MessageCreateParamsNonStreaming, o?: OpcionesLlamada): Promise<Anthropic.Message>;
}

export function modeloAnthropic(apiKey: string): ModeloCliente {
  const cliente = new Anthropic({ apiKey, timeout: TIEMPO_LLAMADA_MS, maxRetries: 1 });
  return { crear: (p, o) => cliente.messages.create(p, o) };
}

/**
 * Opciones para una llamada que debe terminar antes de `limite` (ms desde epoch según `reloj`):
 * timeout = mín(25 s, lo que queda). Undefined si ya no queda tiempo.
 */
export function opcionesHasta(limite: number, reloj: () => number): OpcionesLlamada | undefined {
  const restante = limite - reloj();
  if (restante <= 0) return undefined;
  return { timeout: Math.min(TIEMPO_LLAMADA_MS, restante), signal: AbortSignal.timeout(restante) };
}

export interface Uso {
  entrada: number;
  salida: number;
  cache: number;
}

export interface ResultadoRespuesta {
  texto: string;
  herramientas: string[];
  uso: Uso;
}

/** Falla del turno con lo que se gastó hasta ese punto, para registrarlo antes de escalar. */
export class ErrorRespuesta extends Error {
  constructor(
    mensaje: string,
    readonly uso: Uso,
    readonly herramientas: string[],
    opciones?: { cause?: unknown },
  ) {
    super(mensaje, opciones);
    this.name = "ErrorRespuesta";
  }
}

export interface EntradaResponder {
  modelo: ModeloCliente;
  model: string;
  sistemaEstatico: string;
  sistemaDinamico: string;
  mensajes: Anthropic.MessageParam[];
  ctx: ContextoHerramientas;
  maxIteraciones?: number;
  /** Reloj en ms; por omisión Date.now. */
  reloj?: () => number;
  /** Momento (según `reloj`) en que el turno se da por perdido; por omisión, 85 s desde que empieza. */
  limite?: number;
}

/**
 * Dentro de un turno el bucle reenvía toda la conversación en cada vuelta. Como el bloque
 * dinámico del sistema cambia cada turno, lo único que se cachea entre turnos es el bloque
 * estático; a partir de la segunda vuelta se marca también el último bloque del último
 * mensaje (los resultados de herramientas) para que la vuelta siguiente lea ese prefijo.
 * En la primera vuelta no se marca: la mayoría de los turnos termina ahí y la escritura
 * costaría más sin que nadie la lea. Total: 2 puntos de caché (máximo 4).
 */
function conPuntoDeCache(mensajes: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const ultimo = mensajes.at(-1);
  if (!ultimo || typeof ultimo.content === "string" || ultimo.content.length === 0) return mensajes;
  const bloques = [...ultimo.content];
  const i = bloques.length - 1;
  bloques[i] = { ...bloques[i], cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  return [...mensajes.slice(0, -1), { ...ultimo, content: bloques }];
}

function parametros(
  e: EntradaResponder,
  mensajes: Anthropic.MessageParam[],
  vuelta: number,
): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: e.model,
    // Holgura para el pensamiento adaptativo, que cuenta contra max_tokens; la respuesta en sí es corta.
    max_tokens: 4096,
    system: [
      { type: "text", text: e.sistemaEstatico, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: e.sistemaDinamico },
    ],
    tools: DEFINICIONES,
    messages: vuelta > 0 ? conPuntoDeCache(mensajes) : mensajes,
    // Sonnet 5.5: pensamiento adaptativo por omisión, sin temperature ni tool_choice forzado.
    // Esfuerzo bajo para respuestas cortas de chat.
    output_config: { effort: "low" },
  };
}

function textoDe(r: Anthropic.Message, separador: string): string {
  return r.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(separador)
    .trim();
}

export async function responder(e: EntradaResponder): Promise<ResultadoRespuesta> {
  const mensajes = [...e.mensajes];
  const usadas: string[] = [];
  const uso: Uso = { entrada: 0, salida: 0, cache: 0 };
  const max = e.maxIteraciones ?? 6;
  const reloj = e.reloj ?? Date.now;
  const limite = e.limite ?? reloj() + PRESUPUESTO_TURNO_MS;
  const falla = (mensaje: string, cause?: unknown) =>
    new ErrorRespuesta(mensaje, uso, usadas, cause === undefined ? undefined : { cause });

  for (let i = 0; i < max; i++) {
    // Entre vueltas también corren las herramientas: se revisa el reloj antes de cada llamada.
    const opciones = opcionesHasta(limite, reloj);
    if (!opciones) throw falla(`Se agotó el tiempo del turno tras ${i} llamadas al modelo`);
    let r: Anthropic.Message;
    try {
      r = await e.modelo.crear(parametros(e, mensajes, i), opciones);
    } catch (err) {
      throw falla(`Error del modelo: ${(err as Error).message}`, err);
    }
    uso.entrada += r.usage?.input_tokens ?? 0;
    uso.salida += r.usage?.output_tokens ?? 0;
    uso.cache += r.usage?.cache_read_input_tokens ?? 0;

    if (r.stop_reason === "end_turn" || r.stop_reason === "stop_sequence") {
      const texto = textoDe(r, "\n");
      if (!texto) throw falla("Respuesta vacía del modelo");
      return { texto, herramientas: usadas, uso };
    }
    if (r.stop_reason !== "tool_use") {
      // refusal, max_tokens (texto o tool_use truncado), pause_turn (no hay herramientas de
      // servidor), model_context_window_exceeded: el turno se escala con error_modelo.
      const categoria = r.stop_details?.category ? ` (${r.stop_details.category})` : "";
      throw falla(`El modelo terminó con stop_reason ${r.stop_reason}${categoria}`);
    }

    const llamadas = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (llamadas.length === 0) throw falla("stop_reason tool_use sin bloques tool_use");

    // Se devuelve el contenido completo (incluidos bloques de pensamiento) tal como llegó.
    mensajes.push({ role: "assistant", content: r.content as Anthropic.ContentBlockParam[] });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const b of llamadas) {
      usadas.push(b.name);
      const { contenido, esError } = await ejecutarHerramienta(b.name, b.input, e.ctx);
      resultados.push({
        type: "tool_result",
        tool_use_id: b.id,
        content: contenido,
        ...(esError ? { is_error: true } : {}),
      });
    }
    // Todos los resultados van en un solo mensaje de usuario, en el orden de las llamadas.
    mensajes.push({ role: "user", content: resultados });
  }
  throw falla(`El modelo excedió ${max} iteraciones de herramientas`);
}

/** Resume un hilo largo en 3 a 5 frases para abrir uno nuevo. Sin herramientas. */
export async function resumirHilo(
  modelo: ModeloCliente,
  model: string,
  transcripcion: string,
  opciones?: OpcionesLlamada,
): Promise<string> {
  const r = await modelo.crear(
    {
      model,
      max_tokens: 1024,
      system:
        "Resume esta conversación de ventas de muebles en 3 a 5 frases en español: qué busca el cliente, cantidades, zona, precios ya dados y en qué quedaron. Solo hechos.",
      messages: [{ role: "user", content: transcripcion }],
      output_config: { effort: "low" },
    },
    opciones,
  );
  const texto = textoDe(r, " ");
  if (r.stop_reason !== "end_turn" || !texto)
    throw new Error(`Resumen de hilo fallido (stop_reason ${r.stop_reason})`);
  return texto;
}
