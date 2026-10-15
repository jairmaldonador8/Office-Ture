import { describe, expect, it } from "vitest";
import { ErrorMeta } from "../../src/canales/tipos.js";
import {
  despacharTurnos,
  ejecutarMinuto,
  procesarSeguimientos,
  reenviarAlertas,
  resumenDiario,
  textoSeguimiento,
  vencerModos,
} from "../../src/flujo/cron.js";
import { procesarEvento } from "../../src/flujo/entrada.js";
import { aLocal, horas } from "../../src/hora.js";
import { depsDePrueba, INICIO, mensajeWa, modeloGuionado, respuestaTexto } from "./apoyo.js";

async function conConversacion(respuestas: Parameters<typeof modeloGuionado>[0] = []) {
  const p = depsDePrueba({ modelo: modeloGuionado(respuestas) });
  await procesarEvento(mensajeWa("hola"), p.deps);
  const c = await p.repo.contactoPorExterno("whatsapp", "5218112345678");
  const conv = await p.repo.conversacionDeContacto(c?.id ?? "");
  if (!conv) throw new Error("sin conversación");
  // Lo normal: el bot ya contestó y la conversación quedó sin turno pendiente.
  await p.repo.actualizarConversacion(conv.id, { responderEn: undefined });
  return { ...p, conv };
}

/** Respuesta del bot guardada en el hilo, como si ya hubiera contestado. */
async function respondio(p: Awaited<ReturnType<typeof conConversacion>>, texto = "Claro, ¿qué buscas?") {
  await p.repo.guardarMensaje({
    conversacionId: p.conv.id,
    hilo: p.conv.hilo,
    autor: "bot",
    tipo: "texto",
    texto,
    idExterno: "out.previo",
  });
}

const fueraDeVentana = () => new ErrorMeta("whatsapp", 400, 131047, undefined, "Re-engagement message");

describe("despacharTurnos", () => {
  it("procesa solo vencidos y libera el turno", async () => {
    const p = depsDePrueba({ modelo: modeloGuionado([respuestaTexto("Hola, ¿qué buscas?")]) });
    await procesarEvento(mensajeWa("hola"), p.deps);
    const c = await p.repo.contactoPorExterno("whatsapp", "5218112345678");
    const conv = await p.repo.conversacionDeContacto(c?.id ?? "");
    expect(await despacharTurnos(p.deps)).toBe(0);
    p.reloj.avanzar(5000);
    expect(await despacharTurnos(p.deps)).toBe(1);
    expect(p.wa.textos()).toEqual(["Hola, ¿qué buscas?"]);
    expect(p.repo.enProceso.has(conv?.id ?? "")).toBe(false);
  });

  it("un turno que falla no detiene a los demás y queda liberado", async () => {
    const p = depsDePrueba({ modelo: modeloGuionado([]) });
    await procesarEvento(mensajeWa("hola"), p.deps);
    p.repo.obtenerConversacion = async () => {
      throw new Error("base caída");
    };
    p.reloj.avanzar(5000);
    expect(await despacharTurnos(p.deps)).toBe(1);
    expect(p.repo.enProceso.size).toBe(0);
  });
});

describe("procesarSeguimientos", () => {
  it("toque 1 con texto libre, suma toques y programa el toque 2", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "cotizado", ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: new Date(INICIO.getTime() + 3 * 3_600_000),
      usarPlantilla: false,
    });
    reloj.avanzar(3 * 3_600_000);
    await procesarSeguimientos(deps);
    expect(wa.textos()[0]).toContain("avanzar con este modelo");
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(1);
    expect(repo.seguimientos.filter((s) => !s.cancelado && !s.enviadoEn).map((s) => s.tipo)).toEqual([
      "toque2",
    ]);
    // El toque quedó en el historial como mensaje del bot, con su id de Meta.
    const ultimo = (await repo.mensajesDelHilo(conv.id, conv.hilo)).at(-1);
    expect(ultimo).toMatchObject({ autor: "bot", idExterno: "out.1" });
  });

  it("toque 2 con plantilla usa seguimiento_precio si ya se cotizó y la guarda en el historial", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "cotizado", toques: 1, ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: INICIO,
      usarPlantilla: true,
    });
    reloj.avanzar(1000);
    await procesarSeguimientos(deps);
    expect(wa.enviados.find((e) => e.tipo === "plantilla")?.plantilla).toBe("seguimiento_precio");
    const ultimo = (await repo.mensajesDelHilo(conv.id, conv.hilo)).at(-1);
    expect(ultimo).toMatchObject({ autor: "bot", idExterno: "out.1" });
    expect(ultimo?.texto).toContain("avanzar");
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(2);
    // Tras el toque 2 solo queda el cierre.
    expect(repo.seguimientos.filter((s) => !s.cancelado && !s.enviadoEn).map((s) => s.tipo)).toEqual([
      "cierre",
    ]);
  });

  it("toque 2 sin cotizar usa seguimiento_revision", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "calificado", toques: 1, ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: INICIO,
      usarPlantilla: true,
    });
    await procesarSeguimientos(deps);
    expect(wa.enviados.map((e) => e.plantilla)).toEqual(["seguimiento_revision"]);
  });

  it("toque 2 libre rechazado por ventana cerrada sale una vez con plantilla", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "cotizado", toques: 1, ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    let intentosTexto = 0;
    wa.texto = async () => {
      intentosTexto++;
      throw fueraDeVentana();
    };
    await procesarSeguimientos(deps);
    expect(intentosTexto).toBe(1);
    expect(wa.enviados.map((e) => e.plantilla)).toEqual(["seguimiento_precio"]);
    const bot = (await repo.mensajesDelHilo(conv.id, conv.hilo)).filter((m) => m.autor === "bot");
    // La fila del texto rechazado se borra; queda solo la de la plantilla.
    expect(bot).toHaveLength(1);
    expect(bot[0]?.idExterno).toBe("out.1");
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(2);
  });

  it("en Instagram, un toque rechazado por ventana cerrada enfría el lead sin plantilla", async () => {
    const { deps, repo, ig } = depsDePrueba();
    await procesarEvento(mensajeWa("hola", { canal: "instagram", de: "IG77" }), deps);
    const c = await repo.contactoPorExterno("instagram", "IG77");
    const conv = await repo.conversacionDeContacto(c?.id ?? "");
    if (!conv) throw new Error("sin conversación");
    await repo.actualizarConversacion(conv.id, { ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    ig.texto = async () => {
      throw new ErrorMeta("instagram", 400, 10, 2018278, "fuera de ventana");
    };
    await procesarSeguimientos(deps);
    expect(ig.enviados).toEqual([]);
    expect((await repo.obtenerConversacion(conv.id)).estado).toBe("frio");
    expect(repo.seguimientos.filter((s) => !s.cancelado && !s.enviadoEn)).toEqual([]);
  });

  it("un error distinto al de ventana no manda plantilla", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "cotizado", toques: 1, ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    wa.texto = async () => {
      throw new ErrorMeta("whatsapp", 400, 100, undefined, "parámetro inválido");
    };
    await procesarSeguimientos(deps);
    expect(wa.enviados).toEqual([]);
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(1);
  });

  it("cierre marca frío sin enviar", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "cierre",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    await procesarSeguimientos(deps);
    expect((await repo.obtenerConversacion(conv.id)).estado).toBe("frio");
    expect(wa.enviados).toEqual([]);
  });

  it("no toca conversaciones ya cerradas", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "ganado" });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "cierre",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    await procesarSeguimientos(deps);
    expect((await repo.obtenerConversacion(conv.id)).estado).toBe("ganado");
    expect(wa.enviados).toEqual([]);
  });

  it("no envía si la conversación ya no está en modo bot", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "humano" });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    await procesarSeguimientos(deps);
    expect(wa.enviados).toEqual([]);
  });

  it("no envía a quien pidió que no le escriban", async () => {
    const { deps, repo, wa, conv } = await conConversacion();
    await repo.actualizarLead(conv.id, { noContactar: true });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: INICIO,
      usarPlantilla: false,
    });
    await procesarSeguimientos(deps);
    expect(wa.enviados).toEqual([]);
  });
});

describe("vencerModos", () => {
  it("espera de humano vencida: avisa al cliente, vuelve a bot y marca sin atender", async () => {
    const p = await conConversacion();
    const { deps, repo, wa, reloj, conv } = p;
    await respondio(p);
    await repo.actualizarConversacion(conv.id, {
      modo: "esperando_humano",
      motivoModo: "listo_para_comprar",
      modoHasta: new Date(INICIO.getTime() + 7_200_000),
    });
    reloj.avanzar(7_200_001);
    await vencerModos(deps);
    expect(wa.textos()).toEqual([
      "Bryan sigue revisando tu pedido. Mientras tanto te ayudo con cualquier duda.",
    ]);
    const despues = await repo.obtenerConversacion(conv.id);
    expect(despues.modo).toBe("bot");
    expect(despues.modoHasta).toBeUndefined();
    expect(despues.responderEn).toBeUndefined();
    expect((await repo.obtenerLead(conv.id)).escaladoSinAtender).toBe(true);
  });

  it("si el cliente quedó sin respuesta, en lugar del aviso agenda un turno para contestarle", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, {
      modo: "esperando_humano",
      motivoModo: "queja",
      modoHasta: new Date(INICIO.getTime() + 7_200_000),
    });
    reloj.avanzar(7_200_001);
    await vencerModos(deps);
    expect(wa.enviados).toEqual([]);
    const despues = await repo.obtenerConversacion(conv.id);
    expect(despues.modo).toBe("bot");
    expect(despues.responderEn).toEqual(deps.ahora());
    expect((await repo.obtenerLead(conv.id)).escaladoSinAtender).toBe(true);
  });

  it("con la ventana de 24 h cerrada no avisa ni agenda turno", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, {
      modo: "esperando_humano",
      motivoModo: "queja",
      modoHasta: new Date(INICIO.getTime() + horas(30)),
    });
    reloj.avanzar(horas(30) + 1);
    await vencerModos(deps);
    expect(wa.enviados).toEqual([]);
    const despues = await repo.obtenerConversacion(conv.id);
    expect(despues.modo).toBe("bot");
    expect(despues.responderEn).toBeUndefined();
  });

  it("modo humano vencido vuelve a bot sin mensaje", async () => {
    const p = await conConversacion();
    const { deps, repo, wa, reloj, conv } = p;
    await respondio(p);
    await repo.actualizarConversacion(conv.id, {
      modo: "humano",
      modoHasta: new Date(INICIO.getTime() + 1000),
    });
    reloj.avanzar(2000);
    await vencerModos(deps);
    expect(wa.enviados).toEqual([]);
    const despues = await repo.obtenerConversacion(conv.id);
    expect(despues.modo).toBe("bot");
    expect(despues.responderEn).toBeUndefined();
    expect((await repo.obtenerLead(conv.id)).escaladoSinAtender).toBe(false);
  });

  it("dos ejecuciones al mismo tiempo avisan una sola vez", async () => {
    const p = await conConversacion();
    const { deps, repo, wa, reloj, conv } = p;
    await respondio(p);
    await repo.actualizarConversacion(conv.id, {
      modo: "esperando_humano",
      motivoModo: "listo_para_comprar",
      modoHasta: new Date(INICIO.getTime() + 7_200_000),
    });
    reloj.avanzar(7_200_001);
    await Promise.all([vencerModos(deps), vencerModos(deps)]);
    expect(wa.textos()).toHaveLength(1);
  });

  it("si el modo cambió entre la consulta y el vencimiento, no lo toca", async () => {
    const p = await conConversacion();
    const { deps, repo, wa, reloj, conv } = p;
    await respondio(p);
    await repo.actualizarConversacion(conv.id, {
      modo: "esperando_humano",
      motivoModo: "queja",
      modoHasta: new Date(INICIO.getTime() + 1000),
    });
    reloj.avanzar(2000);
    const original = repo.conversacionesConModoVencido.bind(repo);
    repo.conversacionesConModoVencido = async (ahora) => {
      const lista = await original(ahora);
      // Bryan toma la conversación justo después de la consulta.
      await repo.actualizarConversacion(conv.id, {
        modo: "humano",
        modoHasta: new Date(ahora.getTime() + horas(2)),
      });
      return lista;
    };
    await vencerModos(deps);
    expect(wa.enviados).toEqual([]);
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect((await repo.obtenerLead(conv.id)).escaladoSinAtender).toBe(false);
  });

  it("modo humano vencido con el cliente sin respuesta agenda un turno", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, {
      modo: "humano",
      modoHasta: new Date(INICIO.getTime() + 1000),
    });
    reloj.avanzar(2000);
    await vencerModos(deps);
    expect(wa.enviados).toEqual([]);
    expect((await repo.obtenerConversacion(conv.id)).responderEn).toEqual(deps.ahora());
  });
});

describe("reenviarAlertas", () => {
  it("a los 30 min sin atender reenvía a Bryan y copia al segundo dueño, una sola vez", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "queja",
      texto: "OfficeTure · Queja\nCliente: Laura",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    reloj.avanzar(31 * 60_000);
    await reenviarAlertas(deps);
    await reenviarAlertas(deps);
    const destinos = wa.enviados.map((e) => e.para);
    expect(destinos).toEqual(["5218111111111", "5218122222222"]);
  });

  it("dos ejecuciones al mismo tiempo reenvían una sola vez", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "queja",
      texto: "OfficeTure · Queja\nCliente: Laura",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    reloj.avanzar(31 * 60_000);
    await Promise.all([reenviarAlertas(deps), reenviarAlertas(deps)]);
    expect(wa.enviados.map((e) => e.para)).toEqual(["5218111111111", "5218122222222"]);
  });

  it("no reenvía diferidas, ya reenviadas ni recientes", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    const base = {
      conversacionId: conv.id,
      motivo: "queja",
      texto: "OfficeTure · Queja\nCliente: Laura",
      enviadaA: "5218111111111",
    };
    reloj.avanzar(31 * 60_000);
    await repo.crearAlerta({ ...base, enviadaEn: INICIO, reintentos: 0, diferida: true });
    await repo.crearAlerta({ ...base, enviadaEn: INICIO, reintentos: 1, diferida: false });
    await repo.crearAlerta({ ...base, enviadaEn: deps.ahora(), reintentos: 0, diferida: false });
    expect(await reenviarAlertas(deps)).toBe(0);
    expect(wa.enviados).toEqual([]);
  });

  it("no reenvía si la conversación ya salió de la espera", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "queja",
      texto: "OfficeTure · Queja\nCliente: Laura",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    reloj.avanzar(31 * 60_000);
    expect(await reenviarAlertas(deps)).toBe(1);
    expect(wa.enviados).toEqual([]);
    expect(repo.alertas[0]?.reintentos).toBe(1);
  });
});

describe("resumenDiario", () => {
  it("se manda una vez entre 9 y 10 si hay pendientes", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "descuento",
      texto: "OfficeTure · Pide descuento\nCliente: Laura",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: true,
    });
    reloj.fijar(aLocal(2026, 9, 10, 9, 1));
    expect(await resumenDiario(deps)).toBe(true);
    expect(await resumenDiario(deps)).toBe(false);
    expect(wa.enviados).toHaveLength(1);
    expect(wa.enviados[0]?.para).toBe("5218111111111");
  });

  it("dos ejecuciones al mismo tiempo lo mandan una sola vez", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "descuento",
      texto: "OfficeTure · Pide descuento\nCliente: Laura",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: true,
    });
    reloj.fijar(aLocal(2026, 9, 10, 9, 1));
    const r = await Promise.all([resumenDiario(deps), resumenDiario(deps)]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(wa.enviados).toHaveLength(1);
  });

  it("fuera de las 9 no hace nada", async () => {
    const { deps, wa, reloj } = await conConversacion();
    reloj.fijar(aLocal(2026, 9, 10, 11, 0));
    expect(await resumenDiario(deps)).toBe(false);
    expect(wa.enviados).toEqual([]);
  });
});

describe("textoSeguimiento", () => {
  it("el segundo toque cotizado no asume género", () => {
    const t = textoSeguimiento("cotizado", "toque2");
    expect(t).toContain("si todavía te interesa");
    expect(t).not.toContain("interesado");
  });
});

describe("ejecutarMinuto", () => {
  it("un paso que falla no detiene a los demás", async () => {
    const { deps, repo } = await conConversacion();
    repo.conversacionesConModoVencido = async () => {
      throw new Error("sin conexión");
    };
    const r = await ejecutarMinuto(deps);
    expect(r.modos).toBe("error: sin conexión");
    expect(r.seguimientos).toBe(0);
    expect(r).toHaveProperty("resumen");
  });

  it("corre modos, alertas y resumen primero y como respaldo de pg_cron despacha a lo más un turno, al final", async () => {
    const p = depsDePrueba({ modelo: modeloGuionado([respuestaTexto("Hola"), respuestaTexto("Hola")]) });
    await procesarEvento(mensajeWa("hola"), p.deps);
    await procesarEvento(mensajeWa("hola", { de: "5218119999999", nombre: "Ana" }), p.deps);
    p.reloj.avanzar(5000);
    const r = await ejecutarMinuto(p.deps);
    expect(Object.keys(r)).toEqual(["modos", "alertas", "resumen", "seguimientos", "eventos", "turnos"]);
    expect(r.turnos).toBe(1);
    expect(p.wa.textos()).toEqual(["Hola"]);
  });
});

describe("revisión final: toques y alertas reenviadas", () => {
  it("si el cliente contesta mientras sale el toque, no se suma el toque ni se programa el siguiente", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { estado: "cotizado", ultimoBot: INICIO });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: new Date(INICIO.getTime() + 3 * 3_600_000),
      usarPlantilla: false,
    });
    reloj.avanzar(3 * 3_600_000);
    const original = wa.texto.bind(wa);
    wa.texto = async (para, texto) => {
      const id = await original(para, texto);
      await procesarEvento(mensajeWa("sí, me interesa", { fecha: deps.ahora().toISOString() }), deps);
      return id;
    };
    await procesarSeguimientos(deps);
    expect(wa.textos()).toHaveLength(1);
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(0);
    expect(repo.seguimientos.filter((s) => !s.cancelado && !s.enviadoEn)).toEqual([]);
  });

  it("el reenvío queda registrado con su id: citarlo con /bot resuelve la conversación", async () => {
    const { deps, repo, wa, reloj, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "queja",
      texto: "OfficeTure · Queja\nCliente: Laura",
      enviadaA: "5218111111111",
      idExterno: "wamid.original",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    reloj.avanzar(31 * 60_000);
    await reenviarAlertas(deps);
    expect(repo.alertas).toHaveLength(3);
    expect(repo.alertas.slice(1).map((a) => [a.enviadaA, a.idExterno, a.reintentos, a.diferida])).toEqual([
      ["5218111111111", "out.1", 1, false],
      ["5218122222222", "out.2", 1, false],
    ]);
    // Los reenvíos no se vuelven a reenviar ni cuentan en el resumen.
    reloj.avanzar(31 * 60_000);
    expect(await reenviarAlertas(deps)).toBe(0);
    expect((await repo.resumenDelDia(INICIO)).diferidas).toEqual([]);
    // El socio cita el reenvío que recibió.
    await procesarEvento(mensajeWa("/bot", { de: "5218122222222", citaId: "out.2" }), deps);
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("bot");
    expect(wa.textos("5218122222222").at(-1)).toContain("vuelve a atender");
    expect(repo.alertas.every((a) => a.atendidaEn)).toBe(true);
  });
});
