import { describe, expect, it } from "vitest";
import { procesarEvento, procesarLote } from "../../src/flujo/entrada.js";
import { depsDePrueba, INICIO, mensajeWa } from "./apoyo.js";

async function conversacion(repo: ReturnType<typeof depsDePrueba>["repo"]) {
  const c = await repo.contactoPorExterno("whatsapp", "5218112345678");
  if (!c) throw new Error("sin contacto");
  const conv = await repo.conversacionDeContacto(c.id);
  if (!conv) throw new Error("sin conversación");
  return { contacto: c, conv };
}

describe("procesarEvento: cliente", () => {
  it("primer mensaje crea contacto y conversación, guarda referencia y agenda turno a 4 s", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(
      mensajeWa("Hola, precio de sillas", { referencia: { id: "ad1", titulo: "Sillas desde $1,490" } }),
      deps,
    );
    const { contacto, conv } = await conversacion(repo);
    expect(contacto).toMatchObject({ nombre: "Laura", telefono: "5218112345678" });
    expect(conv.referencia).toEqual({ id: "ad1", titulo: "Sillas desde $1,490" });
    expect(conv.responderEn).toEqual(new Date(INICIO.getTime() + 4000));
    expect(conv.primerCliente).toEqual(INICIO);
    expect((await repo.mensajesDelHilo(conv.id, 1)).map((m) => m.texto)).toEqual(["Hola, precio de sillas"]);
  });

  it("otro mensaje reinicia el temporizador, los toques y cancela seguimientos", async () => {
    const { deps, repo, reloj } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    await repo.actualizarConversacion(conv.id, { toques: 1 });
    await repo.programarSeguimiento({
      conversacionId: conv.id,
      tipo: "toque2",
      programadoPara: new Date(INICIO.getTime() + 1e6),
      usarPlantilla: true,
    });
    reloj.avanzar(2000);
    await procesarEvento(mensajeWa("busco 6"), deps);
    const c2 = await repo.obtenerConversacion(conv.id);
    expect(c2.responderEn).toEqual(new Date(INICIO.getTime() + 6000));
    expect(c2.toques).toBe(0);
    expect(await repo.tomarSeguimientos(new Date(INICIO.getTime() + 2e6), 10)).toEqual([]);
  });

  it("imagen: descarga y guarda en el almacén", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(
      mensajeWa("", { tipo: "imagen", mediaId: "m1", mime: "image/jpeg", idExterno: "wamid.img" }),
      deps,
    );
    const { conv } = await conversacion(repo);
    const [m] = await repo.mensajesDelHilo(conv.id, 1);
    expect(m?.adjunto).toEqual({ ruta: `${conv.id}/wamid.img.jpg`, mime: "image/jpeg" });
  });

  it("audio: se transcribe", async () => {
    const { deps, repo } = depsDePrueba({ transcribir: async () => "quiero seis sillas" });
    await procesarEvento(mensajeWa("", { tipo: "audio", mediaId: "a1", mime: "audio/ogg" }), deps);
    const { conv } = await conversacion(repo);
    expect((await repo.mensajesDelHilo(conv.id, 1))[0]?.texto).toBe("[audio] quiero seis sillas");
  });

  it("en modo humano no agenda turno", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    await repo.actualizarConversacion(conv.id, { modo: "humano", responderEn: undefined });
    await procesarEvento(mensajeWa("sigo aquí"), deps);
    expect((await repo.obtenerConversacion(conv.id)).responderEn).toBeUndefined();
  });
});

describe("procesarEvento: eco humano", () => {
  it("Bryan escribe desde su app: modo humano 12 h, alertas atendidas, mensaje guardado", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "descuento",
      texto: "x",
      enviadaA: "5218111111111",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    await procesarEvento(
      {
        clase: "eco",
        e: {
          canal: "whatsapp",
          idExterno: "wamid.eco",
          para: "5218112345678",
          texto: "Hola, soy Bryan",
          fecha: "",
        },
      },
      deps,
    );
    const c = await repo.obtenerConversacion(conv.id);
    expect(c.modo).toBe("humano");
    expect(c.modoHasta).toEqual(new Date(INICIO.getTime() + 12 * 3_600_000));
    expect((await repo.alertasSinAtender(new Date(INICIO.getTime() + 1))).length).toBe(0);
    expect((await repo.mensajesDelHilo(conv.id, 1)).at(-1)).toMatchObject({
      autor: "humano",
      texto: "Hola, soy Bryan",
    });
  });

  it("eco de un mensaje que mandó el propio bot se ignora", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    await repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
      idExterno: "mid.bot",
    });
    await procesarEvento(
      { clase: "eco", e: { canal: "whatsapp", idExterno: "mid.bot", para: "5218112345678", fecha: "" } },
      deps,
    );
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("bot");
  });
});

describe("procesarEvento: comandos de dueños", () => {
  it("/pausa con teléfono pausa la conversación y confirma al dueño", async () => {
    const { deps, repo, wa } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    await procesarEvento(mensajeWa("/pausa 81 1234 5678", { de: "5218111111111" }), deps);
    const { conv } = await conversacion(repo);
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("pausado");
    expect(wa.textos("5218111111111")[0]).toContain("en pausa con Laura");
    expect(await repo.contactoPorExterno("whatsapp", "5218111111111")).toBeNull();
  });

  it("/bot citando la alerta reactiva al asistente", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    await repo.actualizarConversacion(conv.id, { modo: "esperando_humano" });
    await repo.crearAlerta({
      conversacionId: conv.id,
      motivo: "queja",
      texto: "x",
      enviadaA: "5218111111111",
      idExterno: "wamid.alerta",
      enviadaEn: INICIO,
      reintentos: 0,
      diferida: false,
    });
    await procesarEvento(mensajeWa("/bot", { de: "5218111111111", citaId: "wamid.alerta" }), deps);
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("bot");
  });

  it("/perdido guarda el motivo", async () => {
    const { deps, repo } = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), deps);
    await procesarEvento(mensajeWa("/perdido 8112345678 se fue con otro", { de: "5218111111111" }), deps);
    const { conv } = await conversacion(repo);
    expect((await repo.obtenerConversacion(conv.id)).estado).toBe("perdido");
    expect((await repo.obtenerLead(conv.id)).motivoPerdida).toBe("se fue con otro");
  });

  it("texto normal de un dueño se ignora pero abre su ventana de 24 h", async () => {
    const { deps, repo, wa } = depsDePrueba();
    await procesarEvento(mensajeWa("ok gracias", { de: "5218111111111" }), deps);
    expect(wa.enviados).toEqual([]);
    expect(await repo.ventanaDueno("5218111111111")).toEqual(INICIO);
  });

  it("referencia desconocida responde con ayuda", async () => {
    const { deps, wa } = depsDePrueba();
    await procesarEvento(mensajeWa("/ganado 8100000000", { de: "5218111111111" }), deps);
    expect(wa.textos("5218111111111")[0]).toContain("No encontré esa conversación");
  });
});

describe("procesarLote", () => {
  it("un evento que falla se marca con error y no detiene a los demás", async () => {
    const { deps, repo, wa } = depsDePrueba();
    const malo = mensajeWa("/ganado 8100000000", { de: "5218111111111", idExterno: "wamid.malo" });
    const bueno = mensajeWa("hola", { idExterno: "wamid.bueno" });
    await repo.registrarEvento("wamid.malo", "whatsapp", malo);
    await repo.registrarEvento("wamid.bueno", "whatsapp", bueno);
    wa.falla = true;
    await procesarLote([malo, bueno], deps);
    expect(repo.eventos.get("wamid.malo")?.error).toBe("fallo de envío simulado");
    expect(repo.eventos.get("wamid.bueno")?.procesado).toEqual(INICIO);
    expect(await repo.existeMensajeExterno("wamid.bueno")).toBe(true);
  });

  it("si falla la descarga del adjunto, el mensaje se guarda con una nota", async () => {
    const { deps, repo, wa } = depsDePrueba();
    wa.descargarMedia = async () => {
      throw new Error("URL vencida");
    };
    await procesarLote([mensajeWa("", { tipo: "imagen", mediaId: "m1", mime: "image/jpeg" })], deps);
    const { conv } = await conversacion(repo);
    expect((await repo.mensajesDelHilo(conv.id, 1))[0]?.texto).toBe("[no se pudo descargar la imagen]");
  });
});
