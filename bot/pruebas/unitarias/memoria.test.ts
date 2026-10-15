import { describe, expect, it } from "vitest";
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
