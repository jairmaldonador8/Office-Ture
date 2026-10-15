import { describe, expect, it, vi } from "vitest";
import { RepoMemoria } from "../../src/datos/memoria.js";

async function conConversacion(repo = new RepoMemoria()) {
  const contacto = await repo.crearContacto({
    canal: "whatsapp",
    idExterno: "5218112345678",
    telefono: "5218112345678",
    nombre: "Laura",
  });
  const conv = await repo.crearConversacion(contacto.id, "whatsapp");
  return { repo, contacto, conv };
}

describe("RepoMemoria", () => {
  it("crearContacto y crearConversacion son idempotentes", async () => {
    const repo = new RepoMemoria();
    const datos = { canal: "whatsapp", idExterno: "5218112345678", nombre: "Laura" } as const;
    const [a, b] = await Promise.all([repo.crearContacto(datos), repo.crearContacto(datos)]);
    expect(b.id).toBe(a.id);
    expect(repo.contactos.size).toBe(1);
    const [c1, c2] = await Promise.all([
      repo.crearConversacion(a.id, "whatsapp"),
      repo.crearConversacion(a.id, "whatsapp"),
    ]);
    expect(c2.id).toBe(c1.id);
    expect(repo.conversaciones.size).toBe(1);
  });

  it("sumarToque solo suma si los toques y el último mensaje del cliente no cambiaron", async () => {
    const { repo, conv } = await conConversacion();
    const t = new Date(1000);
    await repo.actualizarConversacion(conv.id, { ultimoCliente: t });
    expect(await repo.sumarToque(conv.id, { toques: 0, ultimoCliente: t }, new Date(2000))).toBe(true);
    const c = await repo.obtenerConversacion(conv.id);
    expect([c.toques, c.ultimoBot]).toEqual([1, new Date(2000)]);
    expect(await repo.sumarToque(conv.id, { toques: 0, ultimoCliente: t }, new Date(3000))).toBe(false);
    await repo.actualizarConversacion(conv.id, { ultimoCliente: new Date(4000), toques: 0 });
    expect(await repo.sumarToque(conv.id, { toques: 0, ultimoCliente: t }, new Date(5000))).toBe(false);
    expect((await repo.obtenerConversacion(conv.id)).toques).toBe(0);
  });

  it("deduplica eventos", async () => {
    const repo = new RepoMemoria();
    const ev = { clase: "eco", e: { canal: "whatsapp", idExterno: "w1", para: "1", fecha: "" } } as const;
    expect(await repo.registrarEvento("w1", "whatsapp", ev)).toBe(true);
    expect(await repo.registrarEvento("w1", "whatsapp", ev)).toBe(false);
  });

  it("tomarTurnos toma solo vencidos, una sola vez, hasta liberar", async () => {
    const { repo, conv } = await conConversacion();
    const t0 = new Date("2026-10-09T16:00:00Z");
    await repo.actualizarConversacion(conv.id, { responderEn: new Date(t0.getTime() + 4000) });
    expect(await repo.tomarTurnos(t0, 10)).toEqual([]);
    const t1 = new Date(t0.getTime() + 5000);
    expect(await repo.tomarTurnos(t1, 10)).toEqual([conv.id]);
    expect(await repo.tomarTurnos(t1, 10)).toEqual([]);
    await repo.actualizarConversacion(conv.id, { responderEn: t1 });
    expect(await repo.tomarTurnos(t1, 10)).toEqual([]); // sigue en proceso
    await repo.liberarTurno(conv.id);
    expect(await repo.tomarTurnos(t1, 10)).toEqual([conv.id]);
  });

  it("tomarTurnos reintenta un turno caído solo después de 3 minutos", async () => {
    const { repo, conv } = await conConversacion();
    const t0 = new Date("2026-10-09T16:00:00Z");
    await repo.actualizarConversacion(conv.id, { responderEn: t0 });
    expect(await repo.tomarTurnos(t0, 10)).toEqual([conv.id]);
    expect(await repo.tomarTurnos(new Date(t0.getTime() + 179_000), 10)).toEqual([]);
    expect(await repo.tomarTurnos(new Date(t0.getTime() + 181_000), 10)).toEqual([conv.id]);
  });

  it("tomarTurnos con bloqueo vencido retoma aunque haya nuevo responderEn", async () => {
    const { repo, conv } = await conConversacion();
    const t0 = new Date("2026-10-09T16:00:00Z");
    await repo.actualizarConversacion(conv.id, { responderEn: t0 });
    await repo.tomarTurnos(t0, 10);
    const t1 = new Date(t0.getTime() + 181_000);
    await repo.actualizarConversacion(conv.id, { responderEn: t1 });
    expect(await repo.tomarTurnos(t1, 10)).toEqual([conv.id]);
  });

  it("tomarTurnos actualiza el campo actualizado de la conversación", async () => {
    const { repo, conv } = await conConversacion();
    const t0 = new Date("2026-10-09T16:00:00Z");
    repo.reloj = () => new Date("2026-10-09T17:00:00Z");
    await repo.actualizarConversacion(conv.id, { responderEn: t0 });
    repo.reloj = () => new Date("2026-10-09T18:00:00Z");
    await repo.tomarTurnos(t0, 10);
    expect(repo.actualizado.get(conv.id)).toEqual(new Date("2026-10-09T18:00:00Z"));
  });

  it("tomarSeguimientos reintenta uno tomado solo después de 5 minutos", async () => {
    const { repo, conv } = await conConversacion();
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: new Date(1000),
      usarPlantilla: false,
    });
    expect(await repo.tomarSeguimientos(new Date(2000), 10)).toHaveLength(1);
    expect(await repo.tomarSeguimientos(new Date(2000 + 299_000), 10)).toEqual([]);
    expect(await repo.tomarSeguimientos(new Date(2000 + 301_000), 10)).toHaveLength(1);
  });

  it("guardarMensaje es idempotente por idExterno", async () => {
    const { repo, conv } = await conConversacion();
    const base = { conversacionId: conv.id, hilo: 1, autor: "bot", tipo: "texto", texto: "hola" } as const;
    const a = await repo.guardarMensaje({ ...base, idExterno: "wamid.1" });
    const b = await repo.guardarMensaje({ ...base, texto: "otro", idExterno: "wamid.1" });
    expect(b.id).toBe(a.id);
    expect(repo.mensajes).toHaveLength(1);
    await repo.guardarMensaje(base);
    await repo.guardarMensaje(base);
    expect(repo.mensajes).toHaveLength(3);
  });

  it("conversacionPorReferencia rechaza usuarios con caracteres no válidos", async () => {
    const { repo } = await conConversacion();
    expect(await repo.conversacionPorReferencia("@a*")).toBeNull();
    expect(await repo.conversacionPorReferencia("@a b")).toBeNull();
  });

  it("lead vacío por defecto y actualización parcial", async () => {
    const { repo, conv } = await conConversacion();
    expect(await repo.obtenerLead(conv.id)).toMatchObject({ prioritario: false, avisoEnviado: false });
    const l = await repo.actualizarLead(conv.id, { cantidad: 6, municipio: "Apodaca" });
    expect(l).toMatchObject({ cantidad: 6, municipio: "Apodaca", prioritario: false });
  });

  it("conversacionPorReferencia por teléfono y por usuario de Instagram", async () => {
    const { repo, conv } = await conConversacion();
    expect((await repo.conversacionPorReferencia("8112345678"))?.id).toBe(conv.id);
    const ig = await repo.crearContacto({ canal: "instagram", idExterno: "IGSID", usuario: "laura.oficina" });
    const convIg = await repo.crearConversacion(ig.id, "instagram");
    expect((await repo.conversacionPorReferencia("@Laura.Oficina"))?.id).toBe(convIg.id);
    expect(await repo.conversacionPorReferencia("8100000000")).toBeNull();
  });

  it("hilos: mensajes por hilo y mover los últimos al nuevo hilo", async () => {
    const { repo, conv } = await conConversacion();
    for (let i = 0; i < 5; i++)
      await repo.guardarMensaje({
        conversacionId: conv.id,
        hilo: 1,
        autor: "cliente",
        tipo: "texto",
        texto: `m${i}`,
        creado: new Date(1000 + i),
      });
    await repo.moverAlHilo(conv.id, 2, 2);
    expect((await repo.mensajesDelHilo(conv.id, 1)).map((m) => m.texto)).toEqual(["m0", "m1", "m2"]);
    expect((await repo.mensajesDelHilo(conv.id, 2)).map((m) => m.texto)).toEqual(["m3", "m4"]);
  });

  it("actualizarConversacion con undefined borra el campo", async () => {
    const { repo, conv } = await conConversacion();
    await repo.actualizarConversacion(conv.id, { modo: "humano", modoHasta: new Date(5) });
    await repo.actualizarConversacion(conv.id, { modo: "bot", modoHasta: undefined });
    const c = await repo.obtenerConversacion(conv.id);
    expect(c.modo).toBe("bot");
    expect(c.modoHasta).toBeUndefined();
  });

  it("seguimientos: tomar vencidos y cancelar", async () => {
    const { repo, conv } = await conConversacion();
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque1",
      programadoPara: new Date(1000),
      usarPlantilla: false,
    });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: new Date(9000),
      usarPlantilla: true,
    });
    expect((await repo.tomarSeguimientos(new Date(2000), 10)).map((s) => s.tipo)).toEqual(["toque1"]);
    await repo.cancelarSeguimientos(conv.id);
    expect(await repo.tomarSeguimientos(new Date(10000), 10)).toEqual([]);
  });

  it("eventosPendientes: solo no procesados, recibidos antes, hasta 5 intentos", async () => {
    const repo = new RepoMemoria();
    repo.reloj = () => new Date(1000);
    const ev = (id: string) =>
      ({ clase: "eco", e: { canal: "whatsapp", idExterno: id, para: "1", fecha: "" } }) as const;
    await repo.registrarEvento("a", "whatsapp", ev("a"));
    await repo.registrarEvento("b", "whatsapp", ev("b"));
    await repo.marcarEventoProcesado("b");
    expect((await repo.eventosPendientes(new Date(500), 10)).length).toBe(0);
    for (let i = 0; i < 5; i++) {
      expect((await repo.eventosPendientes(new Date(2000), 10)).map((e) => e.idExterno)).toEqual(["a"]);
    }
    expect(await repo.eventosPendientes(new Date(2000), 10)).toEqual([]);
  });

  it("conversacionPorReferencia compara los últimos 10 dígitos exactos", async () => {
    const { repo } = await conConversacion();
    expect(await repo.conversacionPorReferencia("5678")).toBeNull();
    expect(await repo.conversacionPorReferencia("@")).toBeNull();
  });

  it("resumenDelDia cuenta solo lo actualizado desde la fecha", async () => {
    const { repo, conv } = await conConversacion();
    repo.reloj = () => new Date(1000);
    await repo.actualizarLead(conv.id, { escaladoSinAtender: true });
    await repo.actualizarConversacion(conv.id, { estado: "frio" });
    expect(await repo.resumenDelDia(new Date(500))).toMatchObject({ sinAtender: 1, frios: 1 });
    expect(await repo.resumenDelDia(new Date(2000))).toMatchObject({ sinAtender: 0, frios: 0 });
  });
});

describe("RepoMemoria: ecos de envíos del bot", () => {
  const T0 = new Date("2026-10-09T16:00:00Z");
  const despues = (ms: number) => new Date(T0.getTime() + ms);

  async function conPendiente(texto: string, tipo: "texto" | "imagen" = "texto") {
    const p = await conConversacion();
    p.repo.reloj = () => T0;
    const fila = await p.repo.guardarMensaje({
      conversacionId: p.conv.id,
      hilo: 1,
      autor: "bot",
      tipo,
      ...(texto ? { texto } : {}),
    });
    return { ...p, fila };
  }

  it("mensajePorExterno devuelve el mensaje con su autor o null", async () => {
    const { repo, conv } = await conConversacion();
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      idExterno: "x1",
    });
    expect((await repo.mensajePorExterno("x1"))?.autor).toBe("bot");
    expect(await repo.mensajePorExterno("x2")).toBeNull();
  });

  it("botPendienteParaEco encuentra el texto pendiente, también recortado como en Instagram", async () => {
    const largo = "á".repeat(600);
    const { repo, conv, fila } = await conPendiente(largo);
    const recortado = `${"á".repeat(498)}...`;
    expect(
      (await repo.botPendienteParaEco(conv.id, { texto: ` ${recortado} `, esImagen: false }, T0))?.id,
    ).toBe(fila.id);
    expect(await repo.botPendienteParaEco(conv.id, { texto: "otra cosa", esImagen: false }, T0)).toBeNull();
    expect(await repo.botPendienteParaEco(conv.id, { texto: largo, esImagen: false }, despues(1))).toBeNull();
  });

  it("botPendienteParaEco de imagen sin texto toma la imagen pendiente más antigua (los ecos llegan en orden)", async () => {
    const { repo, conv, fila } = await conPendiente("", "imagen");
    repo.reloj = () => despues(1000);
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "imagen",
    });
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
    });
    expect((await repo.botPendienteParaEco(conv.id, { esImagen: true }, T0))?.id).toBe(fila.id);
  });

  it("botPendienteParaEco ignora filas con id externo o de otro autor", async () => {
    const { repo, conv, fila } = await conPendiente("Hola");
    await repo.asignarIdExterno(fila.id, "out.1");
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "cliente",
      tipo: "texto",
      texto: "Hola",
    });
    expect(await repo.botPendienteParaEco(conv.id, { texto: "Hola", esImagen: false }, T0)).toBeNull();
  });

  it("asignarIdExterno es idempotente y sustituye un duplicado humano guardado por el eco", async () => {
    const { repo, conv, fila } = await conPendiente("Hola");
    await repo.asignarIdExterno(fila.id, "out.1");
    await repo.asignarIdExterno(fila.id, "out.1");
    expect(repo.mensajes.filter((m) => m.idExterno === "out.1")).toHaveLength(1);

    const otra = await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Ok",
    });
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "humano",
      tipo: "texto",
      idExterno: "out.2",
    });
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await repo.asignarIdExterno(otra.id, "out.2");
    const linea = aviso.mock.calls.map((c) => c.join(" ")).join(" | ");
    aviso.mockRestore();
    expect(repo.mensajes.filter((m) => m.idExterno === "out.2").map((m) => m.autor)).toEqual(["bot"]);
    expect(linea).toContain(conv.id);
  });

  it("asignarIdExterno sobre una fila que ya tiene otro id guarda una copia con el nuevo", async () => {
    const { repo, fila } = await conPendiente("Hola");
    await repo.asignarIdExterno(fila.id, "out.1");
    repo.reloj = () => despues(60_000);
    await repo.asignarIdExterno(fila.id, "out.2");
    expect(repo.mensajes.map((m) => [m.autor, m.texto, m.idExterno, m.creado])).toEqual([
      ["bot", "Hola", "out.1", T0],
      ["bot", "Hola", "out.2", T0],
    ]);
  });

  it("borrarMensaje quita la fila", async () => {
    const { repo, fila } = await conPendiente("Hola");
    await repo.borrarMensaje(fila.id);
    expect(repo.mensajes).toEqual([]);
  });
});
