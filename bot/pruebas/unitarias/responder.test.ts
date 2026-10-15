import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ContextoHerramientas } from "../../src/cerebro/herramientas.js";
import { ErrorRespuesta, type ModeloCliente, responder, resumirHilo } from "../../src/cerebro/responder.js";
import { RepoMemoria } from "../../src/datos/memoria.js";

function modeloGuionado(respuestas: Partial<Anthropic.Message>[]) {
  const llamadas: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const modelo: ModeloCliente = {
    async crear(p) {
      llamadas.push(structuredClone(p));
      const r = respuestas.shift();
      if (!r) throw new Error("sin respuesta guionada");
      return {
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
        ...r,
      } as Anthropic.Message;
    },
  };
  return { modelo, llamadas };
}

async function contexto(): Promise<ContextoHerramientas> {
  const repo = new RepoMemoria();
  await repo.sincronizarProductos([
    {
      slug: "silla-lite",
      categoria: "silla",
      subcategoria: "Operativa",
      nombre: "Silla LITE",
      precio: 1490,
      stock: "proveedor",
      prioridad: "alta",
      uso: ["colaboradores"],
      activo: true,
    },
  ]);
  const c = await repo.crearContacto({ canal: "whatsapp", idExterno: "521" });
  return { repo, conversacion: await repo.crearConversacion(c.id, "whatsapp"), fotos: [], resultados: [] };
}

const base = {
  model: "claude-sonnet-5-5",
  sistemaEstatico: "S",
  sistemaDinamico: "D",
  mensajes: [{ role: "user" as const, content: "precio de sillas" }],
};

const usoHerramienta = (id: string) =>
  ({
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id, name: "info_entrega", input: { municipio: "Monterrey" } },
    ] as Anthropic.ContentBlock[],
  }) as const;

describe("responder", () => {
  it("ejecuta herramientas y devuelve el texto final", async () => {
    const { modelo, llamadas } = modeloGuionado([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "t1", name: "buscar_productos", input: { categoria: "silla" } },
        ] as Anthropic.ContentBlock[],
      },
      {
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "Tenemos la Silla LITE en $1,490 + IVA. ¿Cuántas necesitas?" },
        ] as Anthropic.ContentBlock[],
      },
    ]);
    const ctx = await contexto();
    const r = await responder({ ...base, modelo, ctx });
    expect(r.texto).toBe("Tenemos la Silla LITE en $1,490 + IVA. ¿Cuántas necesitas?");
    expect(r.herramientas).toEqual(["buscar_productos"]);
    expect(r.uso).toEqual({ entrada: 20, salida: 10, cache: 200 });
    const segunda = llamadas[1];
    const ultimo = segunda?.messages.at(-1) as Anthropic.MessageParam;
    expect(ultimo.role).toBe("user");
    const bloque = (ultimo.content as Anthropic.ToolResultBlockParam[])[0];
    expect(bloque).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(String(bloque?.content)).toContain("$1,490 + IVA");
  });

  it("el sistema va en dos bloques y solo el primero lleva caché", async () => {
    const { modelo, llamadas } = modeloGuionado([
      { stop_reason: "end_turn", content: [{ type: "text", text: "Hola" }] as Anthropic.ContentBlock[] },
    ]);
    await responder({ ...base, modelo, ctx: await contexto() });
    const sistema = llamadas[0]?.system as Anthropic.TextBlockParam[];
    expect(sistema[0]).toMatchObject({ text: "S", cache_control: { type: "ephemeral", ttl: "1h" } });
    expect(sistema[1]).toEqual({ type: "text", text: "D" });
    expect(llamadas[0]?.tools?.length).toBe(5);
    expect(llamadas[0]?.output_config).toEqual({ effort: "low" });
  });

  it("varias herramientas en un turno van en un solo mensaje de resultados", async () => {
    const { modelo, llamadas } = modeloGuionado([
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "a", name: "info_entrega", input: { municipio: "Apodaca" } },
          { type: "tool_use", id: "b", name: "registrar_lead", input: { municipio: "Apodaca" } },
        ] as Anthropic.ContentBlock[],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Listo" }] as Anthropic.ContentBlock[] },
    ]);
    await responder({ ...base, modelo, ctx: await contexto() });
    const resultados = llamadas[1]?.messages.at(-1)?.content as Anthropic.ToolResultBlockParam[];
    expect(resultados.map((b) => b.tool_use_id)).toEqual(["a", "b"]);
  });

  it("devuelve el contenido del asistente tal como llegó, con su bloque de pensamiento", async () => {
    const pensamiento = { type: "thinking", thinking: "", signature: "firma" };
    const { modelo, llamadas } = modeloGuionado([
      {
        stop_reason: "tool_use",
        content: [pensamiento, ...usoHerramienta("x").content] as Anthropic.ContentBlock[],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Listo" }] as Anthropic.ContentBlock[] },
    ]);
    await responder({ ...base, modelo, ctx: await contexto() });
    const asistente = llamadas[1]?.messages.at(-2);
    expect(asistente?.role).toBe("assistant");
    const bloques = asistente?.content as Anthropic.ContentBlockParam[];
    expect(bloques[0]).toEqual(pensamiento);
  });

  it("una herramienta que falla regresa is_error sin cortar el turno", async () => {
    const { modelo, llamadas } = modeloGuionado([
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "z", name: "no_existe", input: {} }] as Anthropic.ContentBlock[],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Listo" }] as Anthropic.ContentBlock[] },
    ]);
    await responder({ ...base, modelo, ctx: await contexto() });
    const resultados = llamadas[1]?.messages.at(-1)?.content as Anthropic.ToolResultBlockParam[];
    expect(resultados[0]).toMatchObject({ tool_use_id: "z", is_error: true });
  });

  it("dentro del bucle pone un punto de caché solo en el último bloque del último mensaje", async () => {
    const { modelo, llamadas } = modeloGuionado([
      usoHerramienta("x"),
      usoHerramienta("y"),
      { stop_reason: "end_turn", content: [{ type: "text", text: "Listo" }] as Anthropic.ContentBlock[] },
    ]);
    const mensajes: Anthropic.MessageParam[] = [{ role: "user", content: [{ type: "text", text: "hola" }] }];
    await responder({ ...base, mensajes, modelo, ctx: await contexto() });
    // Primera llamada: sin punto en los mensajes (el bloque dinámico cambia cada turno).
    expect(JSON.stringify(llamadas[0]?.messages)).not.toContain("cache_control");
    // Tercera llamada: solo el último resultado lleva el punto; el anterior ya no.
    const tercera = llamadas[2]?.messages ?? [];
    const conPunto = JSON.stringify(tercera).match(/cache_control/g) ?? [];
    expect(conPunto).toHaveLength(1);
    const ultimos = tercera.at(-1)?.content as Anthropic.ToolResultBlockParam[];
    expect(ultimos.at(-1)).toMatchObject({
      tool_use_id: "y",
      cache_control: { type: "ephemeral" },
    });
    // No se modifica la entrada de quien llama.
    expect(JSON.stringify(mensajes)).not.toContain("cache_control");
  });

  it("falla si excede el máximo de iteraciones", async () => {
    const herramienta = usoHerramienta("x");
    const { modelo } = modeloGuionado([herramienta, herramienta, herramienta]);
    await expect(responder({ ...base, modelo, ctx: await contexto(), maxIteraciones: 2 })).rejects.toThrow(
      /iteraciones/,
    );
  });

  it("falla si el texto final viene vacío", async () => {
    const { modelo } = modeloGuionado([{ stop_reason: "end_turn", content: [] }]);
    await expect(responder({ ...base, modelo, ctx: await contexto() })).rejects.toThrow(/vacía/);
  });

  it("falla con rechazo aunque traiga texto", async () => {
    const { modelo } = modeloGuionado([
      { stop_reason: "refusal", content: [{ type: "text", text: "No puedo" }] as Anthropic.ContentBlock[] },
    ]);
    await expect(responder({ ...base, modelo, ctx: await contexto() })).rejects.toThrow(/refusal/);
  });

  it("falla si la respuesta se corta por max_tokens", async () => {
    const { modelo } = modeloGuionado([
      {
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "Tenemos la Si" }] as Anthropic.ContentBlock[],
      },
    ]);
    await expect(responder({ ...base, modelo, ctx: await contexto() })).rejects.toThrow(/max_tokens/);
  });

  it("el error lleva el uso y las herramientas acumuladas", async () => {
    const { modelo } = modeloGuionado([usoHerramienta("x"), { stop_reason: "refusal", content: [] }]);
    const error = await responder({ ...base, modelo, ctx: await contexto() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRespuesta);
    expect((error as ErrorRespuesta).uso).toEqual({ entrada: 20, salida: 10, cache: 200 });
    expect((error as ErrorRespuesta).herramientas).toEqual(["info_entrega"]);
  });

  it("si el modelo lanza, el error lleva el uso de las llamadas anteriores", async () => {
    const { modelo } = modeloGuionado([usoHerramienta("x")]);
    const error = await responder({ ...base, modelo, ctx: await contexto() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRespuesta);
    expect((error as ErrorRespuesta).message).toContain("sin respuesta guionada");
    expect((error as ErrorRespuesta).uso).toEqual({ entrada: 10, salida: 5, cache: 100 });
  });
});

describe("resumirHilo", () => {
  it("resume sin herramientas y con esfuerzo bajo", async () => {
    const { modelo, llamadas } = modeloGuionado([
      {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Busca 10 sillas en Apodaca." }] as Anthropic.ContentBlock[],
      },
    ]);
    expect(await resumirHilo(modelo, "claude-sonnet-5-5", "cliente: 10 sillas")).toBe(
      "Busca 10 sillas en Apodaca.",
    );
    expect(llamadas[0]?.tools).toBeUndefined();
    expect(llamadas[0]?.output_config).toEqual({ effort: "low" });
  });

  it("falla si el resumen viene vacío", async () => {
    const { modelo } = modeloGuionado([{ stop_reason: "max_tokens", content: [] }]);
    await expect(resumirHilo(modelo, "claude-sonnet-5-5", "x")).rejects.toThrow(/resumen/i);
  });
});
