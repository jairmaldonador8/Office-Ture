import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ErrorMeta } from "../../src/canales/tipos.js";
import type { ModeloCliente } from "../../src/cerebro/responder.js";
import { procesarEvento } from "../../src/flujo/entrada.js";
import { procesarTurno } from "../../src/flujo/turno.js";
import {
  depsDePrueba,
  INICIO,
  llamadaHerramienta,
  mensajeWa,
  modeloGuionado,
  respuestaTexto,
} from "./apoyo.js";

const CLIENTE = "5218112345678";
const BRYAN = "5218111111111";

const LITE = {
  slug: "silla-lite",
  categoria: "silla" as const,
  subcategoria: "Operativa",
  nombre: "Silla LITE",
  precio: 1490,
  stock: "proveedor" as const,
  prioridad: "alta" as const,
  uso: ["colaboradores" as const],
  activo: true,
  fotoUrl: "https://x/lite.jpg",
};

async function conMensaje(
  respuestas: Parameters<typeof modeloGuionado>[0] | ModeloCliente,
  extra: Parameters<typeof mensajeWa>[1] = {},
) {
  const modelo = Array.isArray(respuestas) ? modeloGuionado(respuestas) : respuestas;
  const p = depsDePrueba({ modelo });
  await p.repo.sincronizarProductos([LITE]);
  await procesarEvento(mensajeWa("Hola, precio de sillas", extra), p.deps);
  const contacto = await p.repo.contactoPorExterno("whatsapp", CLIENTE);
  const conv = await p.repo.conversacionDeContacto(contacto?.id ?? "");
  if (!conv) throw new Error("sin conversación");
  return { ...p, conv, modelo };
}

/** Pasa el debounce y toma los turnos vencidos, como el despachador. */
async function tomar(p: Awaited<ReturnType<typeof conMensaje>>) {
  p.reloj.avanzar(5_000);
  return p.repo.tomarTurnos(p.deps.ahora(), 10);
}

describe("procesarTurno", () => {
  it("responde, guarda el mensaje del bot y programa el toque 1", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      respuestaTexto("Hola, soy Mariana de OfficeTure. ¿Cuántas sillas necesitas?"),
    ]);
    await procesarTurno(conv.id, deps);
    expect(wa.textos(CLIENTE)).toEqual(["Hola, soy Mariana de OfficeTure. ¿Cuántas sillas necesitas?"]);
    expect(wa.enviados[0]?.tipo).toBe("escribiendo");
    const c = await repo.obtenerConversacion(conv.id);
    expect(c.ultimoBot).toEqual(INICIO);
    const bot = (await repo.mensajesDelHilo(conv.id, 1)).filter((m) => m.autor === "bot");
    expect(bot).toHaveLength(1);
    expect(bot[0]).toMatchObject({
      idExterno: "out.1",
      texto: "Hola, soy Mariana de OfficeTure. ¿Cuántas sillas necesitas?",
    });
    expect(repo.seguimientos.filter((s) => !s.cancelado).map((s) => s.tipo)).toEqual(["toque1"]);
    expect(repo.llamadas).toHaveLength(1);
    expect(repo.llamadas[0]).toMatchObject({ tokensEntrada: 1, tokensSalida: 1 });
  });

  it("si Claude escala: manda la despedida, avisa a Bryan y no programa seguimiento", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      llamadaHerramienta("escalar", {
        motivo: "pide_humano",
        resumen: "Quiere hablar con una persona",
        urgencia: "hoy",
        tipo_cliente: "individual",
      }),
      respuestaTexto("Claro, Bryan López te atiende en este mismo chat."),
    ]);
    await procesarTurno(conv.id, deps);
    expect(wa.textos(CLIENTE)).toEqual(["Claro, Bryan López te atiende en este mismo chat."]);
    // La escalación queda guardada (y la alerta sale) antes de la despedida: si el proceso
    // muere después de enviar, Bryan ya está avisado.
    const iDespedida = wa.enviados.findIndex((e) => e.para === CLIENTE && e.tipo === "texto");
    const iAlerta = wa.enviados.findIndex((e) => e.para === BRYAN);
    expect(iAlerta).toBeLessThan(iDespedida);
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("esperando_humano");
    expect(repo.seguimientos.filter((s) => !s.cancelado)).toEqual([]);
  });

  it("manda la foto antes del texto, solo una foto por turno", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      llamadaHerramienta("enviar_foto", { slug: "silla-lite" }),
      respuestaTexto("Esta es la LITE, $1,490 + IVA."),
    ]);
    await procesarTurno(conv.id, deps);
    const envios = wa.enviados.filter((e) => e.tipo !== "escribiendo").map((e) => e.tipo);
    expect(envios).toEqual(["imagen", "texto"]);
    const bot = (await repo.mensajesDelHilo(conv.id, 1)).filter((m) => m.autor === "bot");
    expect(bot.map((m) => m.tipo)).toEqual(["imagen", "texto"]);
  });

  it("en espera de humano avisa una sola vez", async () => {
    const { deps, repo, wa, conv, modelo } = await conMensaje([]);
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    await procesarTurno(conv.id, deps);
    await procesarEvento(mensajeWa("¿sigues ahí?"), deps);
    await procesarTurno(conv.id, deps);
    expect(wa.textos(CLIENTE)).toEqual(["Bryan te atiende en un momento."]);
    expect((modelo as ReturnType<typeof modeloGuionado>).llamadas).toBe(0);
    expect((await repo.obtenerConversacion(conv.id)).avisoEsperaEnviado).toBe(true);
  });

  it("en modo humano o si el último mensaje no es del cliente no hace nada", async () => {
    const { deps, repo, wa, conv } = await conMensaje([]);
    await repo.actualizarConversacion(conv.id, { modo: "humano" });
    await procesarTurno(conv.id, deps);
    await repo.actualizarConversacion(conv.id, { modo: "bot" });
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "ya contesté",
    });
    await procesarTurno(conv.id, deps);
    expect(wa.enviados).toEqual([]);
  });

  it("si el modelo falla: mensaje de cortesía, escalación por error y uso registrado", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      llamadaHerramienta("buscar_productos", { categoria: "silla" }),
      new Error("529 overloaded"),
    ]);
    await procesarTurno(conv.id, deps);
    expect(wa.textos(CLIENTE)).toEqual(["Dame un momento, en seguida te atiendo."]);
    const c = await repo.obtenerConversacion(conv.id);
    expect(c).toMatchObject({ modo: "esperando_humano", motivoModo: "error_modelo" });
    expect(repo.llamadas).toHaveLength(1);
    expect(repo.llamadas[0]?.error).toContain("529");
    expect(repo.llamadas[0]).toMatchObject({
      tokensEntrada: 1,
      tokensSalida: 1,
      herramientas: ["buscar_productos"],
    });
    expect(repo.alertas.map((a) => a.motivo)).toEqual(["error_modelo"]);
    expect(c.ultimoBot).toEqual(INICIO);
  });

  it("nunca manda texto rechazado o truncado: solo la cortesía", async () => {
    const { deps, wa, conv } = await conMensaje([
      {
        stop_reason: "refusal",
        content: [{ type: "text", text: "No puedo", citations: null }] as Anthropic.ContentBlock[],
      },
    ]);
    await procesarTurno(conv.id, deps);
    expect(wa.textos(CLIENTE)).toEqual(["Dame un momento, en seguida te atiendo."]);
  });

  it("primera respuesta a un cliente de anuncio abre la ventana gratuita de 72 h", async () => {
    const { deps, repo, conv } = await conMensaje([respuestaTexto("Hola, ¿cuántas necesitas?")], {
      referencia: { id: "ad1" },
    });
    await procesarTurno(conv.id, deps);
    expect((await repo.obtenerConversacion(conv.id)).ventanaGratisHasta).toEqual(
      new Date(INICIO.getTime() + 72 * 3_600_000),
    );
  });

  it("reintenta el envío hasta 3 veces", async () => {
    const { deps, wa, conv } = await conMensaje([respuestaTexto("Hola")]);
    let fallas = 2;
    const original = wa.texto.bind(wa);
    wa.texto = async (p, t) => {
      if (fallas-- > 0) throw new Error("500");
      return original(p, t);
    };
    await procesarTurno(conv.id, deps);
    expect(wa.textos()).toEqual(["Hola"]);
  });

  it("si la respuesta no se puede enviar, escala por falla técnica y no programa seguimiento", async () => {
    const { deps, repo, wa, conv } = await conMensaje([respuestaTexto("Hola")]);
    wa.texto = async (p) => {
      if (p === CLIENTE) throw new ErrorMeta("whatsapp", 400, 131026, undefined, "no entregable");
      return "out.x";
    };
    await procesarTurno(conv.id, deps);
    const c = await repo.obtenerConversacion(conv.id);
    expect(c).toMatchObject({ modo: "esperando_humano", motivoModo: "error_modelo" });
    expect(c.ultimoBot).toBeUndefined();
    expect(repo.seguimientos.filter((s) => !s.cancelado)).toEqual([]);
  });

  it("libera el turno al terminar, también si el modelo falla", async () => {
    const p = await conMensaje([new Error("529 overloaded"), respuestaTexto("Listo")]);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    await p.repo.actualizarConversacion(p.conv.id, { modo: "bot" });
    await procesarEvento(mensajeWa("¿hola?"), p.deps);
    expect(await tomar(p)).toEqual([p.conv.id]);
  });

  it("un mensaje que llega a media respuesta recibe su turno y la respuesta lo considera", async () => {
    let p: Awaited<ReturnType<typeof conMensaje>> | undefined;
    const guion = modeloGuionado([
      respuestaTexto("Son $1,490 + IVA."),
      respuestaTexto("Te paso sillas y archiveros."),
    ]);
    const modelo: ModeloCliente & { llamadas: number } = {
      get llamadas() {
        return guion.llamadas;
      },
      async crear(params) {
        // Durante la primera llamada el cliente manda otro mensaje.
        if (guion.llamadas === 0 && p) await procesarEvento(mensajeWa("y también archiveros"), p.deps);
        return guion.crear(params);
      },
    };
    p = await conMensaje(modelo);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    // La respuesta quedó vieja: no se manda y el turno siguiente contesta todo junto.
    expect(p.wa.textos(CLIENTE)).toEqual([]);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual(["Te paso sillas y archiveros."]);
    expect(p.repo.llamadas).toHaveLength(2);
  });

  it("al pasar de 30 mensajes resume el hilo y abre uno nuevo con los últimos", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      respuestaTexto("Busca 6 sillas LITE para Apodaca."),
      respuestaTexto("Claro, te las aparto."),
    ]);
    for (let i = 0; i < 15; i++) {
      await repo.guardarMensaje({
        conversacionId: conv.id,
        hilo: 1,
        autor: "bot",
        tipo: "texto",
        texto: `bot ${i}`,
      });
      await repo.guardarMensaje({
        conversacionId: conv.id,
        hilo: 1,
        autor: "cliente",
        tipo: "texto",
        texto: `cliente ${i}`,
      });
    }
    await procesarTurno(conv.id, deps);
    const c = await repo.obtenerConversacion(conv.id);
    expect(c).toMatchObject({ hilo: 2, resumenHilo: "Busca 6 sillas LITE para Apodaca." });
    const nuevo = await repo.mensajesDelHilo(conv.id, 2);
    expect(nuevo).toHaveLength(7);
    expect(nuevo.at(-1)).toMatchObject({ autor: "bot", texto: "Claro, te las aparto." });
    expect(wa.textos(CLIENTE)).toEqual(["Claro, te las aparto."]);
    // El resumen también cuenta como llamada al modelo.
    expect(repo.llamadas).toHaveLength(2);
    expect(repo.llamadas.every((l) => l.error === undefined)).toBe(true);
  });

  it("pasa la imagen reciente del cliente al modelo", async () => {
    const vistos: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const guion = modeloGuionado([respuestaTexto("Bonita oficina.")]);
    const { deps, repo, conv } = await conMensaje({
      crear: (params) => {
        vistos.push(params);
        return guion.crear(params);
      },
    });
    await deps.almacen.guardar(`${conv.id}/foto.jpg`, new Uint8Array([1, 2, 3]), "image/jpeg");
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "cliente",
      tipo: "imagen",
      adjunto: { ruta: `${conv.id}/foto.jpg`, mime: "image/jpeg" },
    });
    await procesarTurno(conv.id, deps);
    const ultimo = vistos[0]?.messages.at(-1);
    expect(JSON.stringify(ultimo?.content)).toContain('"type":"image"');
  });

  it("si Claude escaló y el cliente escribió a media respuesta, igual manda la despedida y escala", async () => {
    let p: Awaited<ReturnType<typeof conMensaje>> | undefined;
    const modelo = aMedia(
      [
        llamadaHerramienta("escalar", {
          motivo: "pide_humano",
          resumen: "Quiere hablar con una persona",
          urgencia: "hoy",
          tipo_cliente: "individual",
        }),
        respuestaTexto("Claro, Bryan López te atiende en este mismo chat."),
      ],
      async () => {
        if (p) await procesarEvento(mensajeWa("¿me oyes?"), p.deps);
      },
    );
    p = await conMensaje(modelo);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual(["Claro, Bryan López te atiende en este mismo chat."]);
    expect((await p.repo.obtenerConversacion(p.conv.id)).modo).toBe("esperando_humano");
    expect(p.repo.alertas.map((a) => a.motivo)).toEqual(["pide_humano"]);
  });

  it("si Bryan escribe desde su app a media respuesta, no manda nada ni programa seguimiento", async () => {
    let p: Awaited<ReturnType<typeof conMensaje>> | undefined;
    const modelo = aMedia([respuestaTexto("Son $1,490 + IVA.")], async () => {
      if (p)
        await procesarEvento(
          {
            clase: "eco",
            e: {
              canal: "whatsapp",
              idExterno: "wamid.bryan",
              para: CLIENTE,
              texto: "Yo te atiendo",
              fecha: "",
            },
          },
          p.deps,
        );
    });
    p = await conMensaje(modelo);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual([]);
    const c = await p.repo.obtenerConversacion(p.conv.id);
    expect(c.modo).toBe("humano");
    expect(c.ultimoBot).toBeUndefined();
    expect(p.repo.seguimientos.filter((s) => !s.cancelado)).toEqual([]);
    expect(p.repo.llamadas).toHaveLength(1);
    const bot = (await p.repo.mensajesDelHilo(p.conv.id, 1)).filter((m) => m.autor === "bot");
    expect(bot).toEqual([]);
  });

  it("descarta una respuesta vieja solo una vez seguida; la siguiente sale y el mensaje nuevo tiene turno", async () => {
    let p: Awaited<ReturnType<typeof conMensaje>> | undefined;
    const nuevos = ["y archiveros", "y también escritorios"];
    const modelo = aMedia(
      [
        respuestaTexto("Son $1,490 + IVA."),
        respuestaTexto("Te paso sillas y archiveros."),
        respuestaTexto("Escritorios desde $2,750 + IVA."),
      ],
      async (n) => {
        const texto = nuevos[n];
        if (!p || !texto) return;
        p.reloj.avanzar(1_000);
        await procesarEvento(mensajeWa(texto), p.deps);
      },
    );
    p = await conMensaje(modelo);
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual([]);
    // Segundo turno: el cliente vuelve a escribir a media respuesta, pero ya se descartó una.
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual(["Te paso sillas y archiveros."]);
    // La respuesta queda antes del mensaje que llegó mientras se generaba: ese mensaje tiene turno.
    const hilo = await p.repo.mensajesDelHilo(p.conv.id, 1);
    expect(hilo.at(-1)).toMatchObject({ autor: "cliente", texto: "y también escritorios" });
    expect(await tomar(p)).toEqual([p.conv.id]);
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual(["Te paso sillas y archiveros.", "Escritorios desde $2,750 + IVA."]);
  });

  it("la escalación queda guardada antes de mandar la despedida", async () => {
    const { deps, repo, wa, conv } = await conMensaje([
      llamadaHerramienta("escalar", {
        motivo: "pide_humano",
        resumen: "Quiere hablar con una persona",
        urgencia: "hoy",
        tipo_cliente: "individual",
      }),
      respuestaTexto("Claro, Bryan López te atiende en este mismo chat."),
    ]);
    let alEnviar: { modo: string; alertas: number } | undefined;
    const original = wa.texto.bind(wa);
    wa.texto = async (para, t) => {
      if (para === CLIENTE)
        alEnviar = { modo: (await repo.obtenerConversacion(conv.id)).modo, alertas: repo.alertas.length };
      return original(para, t);
    };
    await procesarTurno(conv.id, deps);
    expect(alEnviar).toEqual({ modo: "esperando_humano", alertas: 1 });
  });

  it("si se cae después de enviar, el turno retomado completa el cierre sin volver a llamar al modelo", async () => {
    const p = await conMensaje([respuestaTexto("Hola, ¿cuántas necesitas?")]);
    const original = p.repo.actualizarConversacion.bind(p.repo);
    let caida = true;
    p.repo.actualizarConversacion = async (id, cambios) => {
      if (caida && "ultimoBot" in cambios) {
        caida = false;
        throw new Error("proceso muerto");
      }
      return original(id, cambios);
    };
    await expect(procesarTurno(p.conv.id, p.deps)).rejects.toThrow("proceso muerto");
    expect((await p.repo.obtenerConversacion(p.conv.id)).ultimoBot).toBeUndefined();
    await procesarTurno(p.conv.id, p.deps);
    expect(p.wa.textos(CLIENTE)).toEqual(["Hola, ¿cuántas necesitas?"]);
    expect((p.modelo as ReturnType<typeof modeloGuionado>).llamadas).toBe(1);
    expect((await p.repo.obtenerConversacion(p.conv.id)).ultimoBot).toEqual(INICIO);
    expect(p.repo.seguimientos.filter((s) => !s.cancelado).map((s) => s.tipo)).toEqual(["toque1"]);
  });
});

/** Modelo guionado que corre `durante(n)` dentro de su llamada número n (desde 0), antes de responder. */
function aMedia(
  respuestas: Parameters<typeof modeloGuionado>[0],
  durante: (n: number) => Promise<void>,
): ModeloCliente & { llamadas: number } {
  const guion = modeloGuionado(respuestas);
  return {
    get llamadas() {
      return guion.llamadas;
    },
    async crear(params) {
      await durante(guion.llamadas);
      return guion.crear(params);
    },
  };
}
