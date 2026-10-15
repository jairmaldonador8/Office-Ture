import { describe, expect, it, vi } from "vitest";
import { recortarBytes } from "../../src/canales/instagram.js";
import { type EcoHumano, ErrorMeta, type EventoCanal } from "../../src/canales/tipos.js";
import { parsearWhatsApp } from "../../src/canales/whatsapp.js";
import { procesarEvento, procesarLote } from "../../src/flujo/entrada.js";
import { enviarAlCliente } from "../../src/flujo/enviar.js";
import { depsDePrueba, INICIO, mensajeWa } from "./apoyo.js";

const IGSID = "IGSID1";

function eco(e: Partial<EcoHumano> & { idExterno: string }): EventoCanal {
  return { clase: "eco", e: { canal: "instagram", para: IGSID, fecha: INICIO.toISOString(), ...e } };
}

/** Payload de WhatsApp con un solo eco de la app de Bryan para el cliente de `mensajeWa`. */
const ecoWa = (eco: object) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "smb_message_echoes",
          value: {
            messaging_product: "whatsapp",
            message_echoes: [{ from: "5218124283124", to: "5218112345678", timestamp: "1791561600", ...eco }],
          },
        },
      ],
    },
  ],
});

async function conversacionIg(p: ReturnType<typeof depsDePrueba>) {
  await procesarEvento(
    {
      clase: "mensaje",
      m: {
        canal: "instagram",
        idExterno: "mid.cliente",
        de: IGSID,
        tipo: "texto",
        texto: "hola",
        fecha: INICIO.toISOString(),
      },
    },
    p.deps,
  );
  const contacto = await p.repo.contactoPorExterno("instagram", IGSID);
  const conv = contacto ? await p.repo.conversacionDeContacto(contacto.id) : null;
  if (!contacto || !conv) throw new Error("sin conversación");
  return { contacto, conv };
}

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

  it("ultimoCliente usa la hora del mensaje y no la del proceso (reintentos tardíos)", async () => {
    const { deps, repo, reloj } = depsDePrueba();
    reloj.avanzar(10 * 60_000);
    await procesarEvento(mensajeWa("hola"), deps);
    const { conv } = await conversacion(repo);
    expect(conv.ultimoCliente).toEqual(INICIO);
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

describe("ecos de los envíos del propio bot", () => {
  it("eco de Instagram que llega antes de asignar el id: no pasa a modo humano y el id queda asignado", async () => {
    const p = depsDePrueba();
    const { contacto, conv } = await conversacionIg(p);
    const largo = "Claro. ".repeat(200);
    p.ig.texto = async () => {
      await procesarEvento(eco({ idExterno: "mid.bot1", texto: recortarBytes(largo, 1000) }), p.deps);
      return "mid.bot1";
    };
    expect(await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: largo })).toBe("mid.bot1");
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("bot");
    const mensajes = await p.repo.mensajesDelHilo(conv.id, 1);
    expect(mensajes.map((m) => [m.autor, m.idExterno])).toEqual([
      ["cliente", "mid.cliente"],
      ["bot", "mid.bot1"],
    ]);
  });

  it("eco de Instagram de una imagen del bot sin texto se reconoce", async () => {
    const p = depsDePrueba();
    const { contacto, conv } = await conversacionIg(p);
    p.ig.imagen = async () => {
      await procesarEvento(eco({ idExterno: "mid.foto", tipo: "imagen" }), p.deps);
      return "mid.foto";
    };
    await enviarAlCliente(p.deps, conv, contacto, {
      tipo: "imagen",
      url: "https://x/lite.jpg",
      pie: "Silla LITE",
    });
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("bot");
    expect((await p.repo.mensajesDelHilo(conv.id, 1)).at(-1)).toMatchObject({
      autor: "bot",
      tipo: "imagen",
      texto: "Silla LITE",
      idExterno: "mid.foto",
    });
  });

  it("eco de Bryan sin envío pendiente que coincida: modo humano, sin esperar", async () => {
    const p = depsDePrueba({
      esperar: async () => {
        throw new Error("no debe esperar");
      },
    });
    const { conv } = await conversacionIg(p);
    await p.repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
    });
    await procesarEvento(eco({ idExterno: "mid.bryan", texto: "Soy Bryan, te marco" }), p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect(await p.repo.mensajePorExterno("mid.bryan")).toMatchObject({
      autor: "humano",
      texto: "Soy Bryan, te marco",
    });
  });

  it("un pendiente de hace más de 2 minutos no se confunde con el eco", async () => {
    const p = depsDePrueba();
    const { conv } = await conversacionIg(p);
    await p.repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
    });
    p.reloj.avanzar(3 * 60_000);
    await procesarEvento(
      eco({
        idExterno: "mid.tarde",
        texto: "Hola",
        fecha: new Date(INICIO.getTime() + 3 * 60_000).toISOString(),
      }),
      p.deps,
    );
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
  });

  it("eco de un mensaje del bot ya guardado se ignora aunque se repita", async () => {
    const p = depsDePrueba();
    const { contacto, conv } = await conversacionIg(p);
    await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" });
    await procesarEvento(eco({ idExterno: "out.1", texto: "Hola" }), p.deps);
    await procesarEvento(eco({ idExterno: "out.1", texto: "Hola" }), p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("bot");
    expect(p.repo.mensajes.filter((m) => m.idExterno === "out.1")).toHaveLength(1);
  });

  it("si el primer intento del eco de Bryan falla al actualizar la conversación, el reintento lo deja en modo humano", async () => {
    const p = depsDePrueba();
    const { conv } = await conversacionIg(p);
    const original = p.repo.actualizarConversacion.bind(p.repo);
    let fallas = 1;
    p.repo.actualizarConversacion = async (id, cambios) => {
      if (fallas-- > 0) throw new Error("Supabase caído");
      return original(id, cambios);
    };
    const ev = eco({ idExterno: "mid.bryan", texto: "Te atiendo yo" });
    await p.repo.registrarEvento("mid.bryan", "instagram", ev);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await procesarLote([ev], p.deps);
    error.mockRestore();
    expect(p.repo.eventos.get("mid.bryan")?.error).toBe("Supabase caído");
    await procesarLote([ev], p.deps);
    const c = await p.repo.obtenerConversacion(conv.id);
    expect(c.modo).toBe("humano");
    expect(c.motivoModo).toBe("bryan_escribio");
    expect(p.repo.mensajes.filter((m) => m.idExterno === "mid.bryan")).toHaveLength(1);
  });

  it("si el eco de Bryan ya quedó guardado, el reintento aún aplica el modo humano", async () => {
    const p = depsDePrueba();
    const { conv } = await conversacionIg(p);
    await p.repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "humano",
      tipo: "texto",
      texto: "Te atiendo yo",
      idExterno: "mid.bryan",
    });
    await procesarEvento(eco({ idExterno: "mid.bryan", texto: "Te atiendo yo" }), p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect(p.repo.mensajes.filter((m) => m.idExterno === "mid.bryan")).toHaveLength(1);
  });

  it("imagen o audio de Bryan se guardan con su tipo y una nota", async () => {
    const p = depsDePrueba();
    const { conv } = await conversacionIg(p);
    await procesarEvento(eco({ idExterno: "mid.img", tipo: "imagen" }), p.deps);
    await procesarEvento(eco({ idExterno: "mid.aud", tipo: "audio" }), p.deps);
    await procesarEvento(eco({ idExterno: "mid.pie", tipo: "imagen", texto: "Así queda" }), p.deps);
    expect(
      (await p.repo.mensajesDelHilo(conv.id, 1)).slice(1).map((m) => [m.autor, m.tipo, m.texto]),
    ).toEqual([
      ["humano", "imagen", "[Bryan envió una imagen]"],
      ["humano", "audio", "[Bryan envió un audio]"],
      ["humano", "imagen", "Así queda"],
    ]);
  });

  it("eco de WhatsApp con el mismo texto que un envío pendiente del bot es de Bryan (la Cloud API no genera ecos)", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { conv } = await conversacion(p.repo);
    const pendiente = await p.repo.guardarMensaje({
      conversacionId: conv.id,
      hilo: 1,
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
    });
    await procesarEvento(
      {
        clase: "eco",
        e: {
          canal: "whatsapp",
          idExterno: "wamid.bryan",
          para: "5218112345678",
          texto: "Hola",
          fecha: INICIO.toISOString(),
        },
      },
      p.deps,
    );
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect(p.repo.mensajes.find((m) => m.id === pendiente.id)?.idExterno).toBeUndefined();
    expect(await p.repo.mensajePorExterno("wamid.bryan")).toMatchObject({ autor: "humano", texto: "Hola" });
  });

  it("eco de WhatsApp de un mensaje borrado por Bryan: modo humano sin guardar mensaje", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { conv } = await conversacion(p.repo);
    const [ev] = parsearWhatsApp(
      ecoWa({ id: "wamid.borra", type: "revoke", revoke: { original_message_id: "wamid.x" } }),
    );
    if (!ev) throw new Error("sin evento");
    await procesarEvento(ev, p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect(await p.repo.mensajePorExterno("wamid.borra")).toBeNull();
  });

  it("eco de WhatsApp de un mensaje editado por Bryan: modo humano y nota con el texto nuevo", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { conv } = await conversacion(p.repo);
    const [ev] = parsearWhatsApp(
      ecoWa({
        id: "wamid.edita",
        type: "edit",
        edit: { original_message_id: "wamid.x", message: { type: "text", text: { body: "Son 6 sillas" } } },
      }),
    );
    if (!ev) throw new Error("sin evento");
    await procesarEvento(ev, p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("humano");
    expect(await p.repo.mensajePorExterno("wamid.edita")).toMatchObject({
      autor: "humano",
      texto: "[Bryan editó un mensaje] Son 6 sillas",
    });
  });

  it("eco para un contacto sin conversación avisa en consola con el id enmascarado", async () => {
    const p = depsDePrueba();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await procesarEvento(eco({ idExterno: "mid.x", para: "IGSID98765", texto: "hola" }), p.deps);
    expect(aviso).toHaveBeenCalledOnce();
    const linea = aviso.mock.calls[0]?.join(" ") ?? "";
    aviso.mockRestore();
    expect(linea).toContain("instagram");
    expect(linea).not.toContain("IGSID98765");
    expect(linea).toContain("8765");
  });
});

describe("enviarAlCliente", () => {
  it("guarda la fila antes de enviar y le asigna el id devuelto", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    let filasAlEnviar = 0;
    const original = p.wa.texto.bind(p.wa);
    p.wa.texto = async (para, texto) => {
      filasAlEnviar = p.repo.mensajes.filter((m) => m.autor === "bot" && !m.idExterno).length;
      return original(para, texto);
    };
    expect(await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" })).toBe("out.1");
    expect(filasAlEnviar).toBe(1);
    expect((await p.repo.mensajesDelHilo(conv.id, 1)).at(-1)).toMatchObject({
      autor: "bot",
      tipo: "texto",
      texto: "Hola",
      idExterno: "out.1",
    });
  });

  it("si Meta rechaza el envío, borra la fila pendiente y relanza", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    p.wa.texto = async () => {
      throw new ErrorMeta("whatsapp", 400, 131047, undefined, "fuera de ventana");
    };
    await expect(
      enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" }, { intentos: 3 }),
    ).rejects.toBeInstanceOf(ErrorMeta);
    expect(p.repo.mensajes.filter((m) => m.autor === "bot")).toEqual([]);
  });

  it("si no se sabe si salió (red o tiempo agotado), la fila queda pendiente para reconocer un eco tardío", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    p.wa.falla = true;
    await expect(enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" })).rejects.toThrow(
      "fallo de envío simulado",
    );
    expect(p.repo.mensajes.filter((m) => m.autor === "bot").map((m) => m.idExterno)).toEqual([undefined]);
  });

  it("tras un intento dudoso, el que sale guarda su propia fila y la original sigue pendiente", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    let fallas = 2;
    const original = p.wa.texto.bind(p.wa);
    p.wa.texto = async (para, texto) => {
      if (fallas-- > 0) throw new Error("500");
      return original(para, texto);
    };
    await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" }, { intentos: 3 });
    expect(p.wa.textos()).toEqual(["Hola"]);
    expect(p.repo.mensajes.filter((m) => m.autor === "bot").map((m) => [m.texto, m.idExterno])).toEqual([
      ["Hola", undefined],
      ["Hola", "out.1"],
    ]);
  });

  it("si el primer intento sí salió, su eco tardío se reconoce aunque el reintento ya tenga id", async () => {
    const p = depsDePrueba();
    const { contacto, conv } = await conversacionIg(p);
    let intento = 0;
    p.ig.texto = async () => {
      intento++;
      if (intento === 1) throw new Error("tiempo agotado");
      return "mid.2";
    };
    expect(
      await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" }, { intentos: 2 }),
    ).toBe("mid.2");
    await procesarEvento(eco({ idExterno: "mid.1", texto: "Hola" }), p.deps);
    await procesarEvento(eco({ idExterno: "mid.2", texto: "Hola" }), p.deps);
    expect((await p.repo.obtenerConversacion(conv.id)).modo).toBe("bot");
    expect(p.repo.mensajes.filter((m) => m.autor !== "cliente").map((m) => [m.autor, m.idExterno])).toEqual([
      ["bot", "mid.1"],
      ["bot", "mid.2"],
    ]);
  });

  it("un 429 de Meta se reintenta como resultado dudoso, no como rechazo", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    let fallas = 1;
    const original = p.wa.texto.bind(p.wa);
    p.wa.texto = async (para, texto) => {
      if (fallas-- > 0) throw new ErrorMeta("whatsapp", 429, 130429, undefined, "límite");
      return original(para, texto);
    };
    expect(
      await enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" }, { intentos: 2 }),
    ).toBe("out.1");
    expect(p.repo.mensajes.filter((m) => m.autor === "bot").map((m) => m.idExterno)).toEqual([
      undefined,
      "out.1",
    ]);
  });

  it("un 429 en el único intento conserva la fila pendiente", async () => {
    const p = depsDePrueba();
    await procesarEvento(mensajeWa("hola"), p.deps);
    const { contacto, conv } = await conversacion(p.repo);
    p.wa.texto = async () => {
      throw new ErrorMeta("whatsapp", 429, 130429, undefined, "límite");
    };
    await expect(
      enviarAlCliente(p.deps, conv, contacto, { tipo: "texto", texto: "Hola" }),
    ).rejects.toBeInstanceOf(ErrorMeta);
    expect(p.repo.mensajes.filter((m) => m.autor === "bot")).toHaveLength(1);
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
