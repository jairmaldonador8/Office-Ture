import { describe, expect, it } from "vitest";
import { parsearInstagram } from "../../src/canales/instagram.js";

const NEGOCIO = "17841400000000000";
const envolver = (messaging: object[]) => ({
  object: "instagram",
  entry: [{ id: NEGOCIO, time: 1, messaging }],
});

describe("parsearInstagram", () => {
  it("texto con referencia de anuncio", () => {
    const ev = parsearInstagram(
      envolver([
        {
          sender: { id: "IGSID1" },
          recipient: { id: NEGOCIO },
          timestamp: 1791561600000,
          message: { mid: "mid.1", text: "Info de escritorios" },
          referral: {
            ad_id: "ad9",
            source: "ADS",
            type: "OPEN_THREAD",
            ads_context_data: { ad_title: "Escritorios de entrega inmediata" },
          },
        },
      ]),
      NEGOCIO,
    );
    expect(ev).toEqual([
      {
        clase: "mensaje",
        m: {
          canal: "instagram",
          idExterno: "mid.1",
          de: "IGSID1",
          tipo: "texto",
          texto: "Info de escritorios",
          referencia: { id: "ad9", titulo: "Escritorios de entrega inmediata" },
          fecha: new Date(1791561600000).toISOString(),
        },
      },
    ]);
  });

  it("imagen, audio y respuesta a historia", () => {
    const ev = parsearInstagram(
      envolver([
        {
          sender: { id: "A" },
          recipient: { id: NEGOCIO },
          timestamp: 1,
          message: {
            mid: "m2",
            attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }],
          },
        },
        {
          sender: { id: "A" },
          recipient: { id: NEGOCIO },
          timestamp: 1,
          message: {
            mid: "m3",
            attachments: [{ type: "audio", payload: { url: "https://cdn/a.mp4" } }],
          },
        },
        {
          sender: { id: "A" },
          recipient: { id: NEGOCIO },
          timestamp: 1,
          message: {
            mid: "m4",
            text: "Me interesa",
            reply_to: { story: { id: "s1", url: "https://cdn/s" } },
          },
        },
      ]),
      NEGOCIO,
    );
    const ms = ev.map((e) => (e.clase === "mensaje" ? e.m : null));
    expect(ms[0]).toMatchObject({ tipo: "imagen", mediaUrl: "https://cdn/x.jpg" });
    expect(ms[1]).toMatchObject({ tipo: "audio", mediaUrl: "https://cdn/a.mp4" });
    expect(ms[2]).toMatchObject({
      tipo: "texto",
      texto: "[respondió a una historia] Me interesa",
    });
  });

  it("eco de mensaje enviado desde la app de Instagram", () => {
    const ev = parsearInstagram(
      envolver([
        {
          sender: { id: NEGOCIO },
          recipient: { id: "IGSID1" },
          timestamp: 5000,
          message: { mid: "mid.eco", text: "Hola, soy Bryan", is_echo: true },
        },
      ]),
      NEGOCIO,
    );
    expect(ev).toEqual([
      {
        clase: "eco",
        e: {
          canal: "instagram",
          idExterno: "mid.eco",
          para: "IGSID1",
          texto: "Hola, soy Bryan",
          fecha: new Date(5000).toISOString(),
        },
      },
    ]);
  });

  it("eco de una imagen lleva su tipo y no trae texto", () => {
    const ev = parsearInstagram(
      envolver([
        {
          sender: { id: NEGOCIO },
          recipient: { id: "IGSID1" },
          timestamp: 5000,
          message: {
            mid: "mid.foto",
            is_echo: true,
            attachments: [{ type: "image", payload: { url: "https://x" } }],
          },
        },
      ]),
      NEGOCIO,
    );
    expect(ev).toEqual([
      {
        clase: "eco",
        e: {
          canal: "instagram",
          idExterno: "mid.foto",
          para: "IGSID1",
          tipo: "imagen",
          fecha: new Date(5000).toISOString(),
        },
      },
    ]);
  });

  it("ignora lecturas, reacciones, mensajes borrados y otros objetos", () => {
    expect(
      parsearInstagram(
        envolver([{ sender: { id: "A" }, recipient: { id: NEGOCIO }, timestamp: 1, read: { mid: "x" } }]),
        NEGOCIO,
      ),
    ).toEqual([]);
    expect(
      parsearInstagram(
        envolver([
          {
            sender: { id: "A" },
            recipient: { id: NEGOCIO },
            timestamp: 1,
            message: { mid: "x", is_deleted: true },
          },
        ]),
        NEGOCIO,
      ),
    ).toEqual([]);
    expect(parsearInstagram({ object: "page" }, NEGOCIO)).toEqual([]);
  });

  it("no lanza con payloads malformados y conserva los mensajes válidos", () => {
    const payload = {
      object: "instagram",
      entry: [
        null,
        { messaging: "x" },
        {
          messaging: [
            null,
            {
              sender: { id: "A" },
              recipient: { id: NEGOCIO },
              timestamp: 1791561600000,
              message: { text: "sin mid" },
            },
            {
              sender: { id: "A" },
              recipient: { id: NEGOCIO },
              timestamp: 1791561600000,
              message: { mid: "mid.ok", text: "hola" },
            },
            { recipient: { id: NEGOCIO }, message: { mid: "mid.sinsender", text: "x" } },
          ],
        },
      ],
    };
    let ev: ReturnType<typeof parsearInstagram> = [];
    expect(() => {
      ev = parsearInstagram(payload, NEGOCIO);
    }).not.toThrow();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ clase: "mensaje", m: { idExterno: "mid.ok", texto: "hola" } });
  });

  it("un text que no es cadena no se usa como texto", () => {
    const ev = parsearInstagram(
      envolver([
        {
          sender: { id: "IGSID1" },
          recipient: { id: NEGOCIO },
          timestamp: 1,
          message: { mid: "m1", text: 5 },
        },
        {
          sender: { id: NEGOCIO },
          recipient: { id: "IGSID1" },
          timestamp: 1,
          message: { mid: "m2", text: { a: 1 }, is_echo: true },
        },
      ]),
      NEGOCIO,
    );
    expect(ev).toHaveLength(2);
    const [m, e] = ev.map((x) => (x.clase === "mensaje" ? x.m : x.e));
    expect(m?.texto).not.toContain("5");
    expect(e).not.toHaveProperty("texto");
  });

  it("sin timestamp usa la hora actual en ISO", () => {
    const ev = parsearInstagram(
      envolver([
        { sender: { id: "A" }, recipient: { id: NEGOCIO }, message: { mid: "mid.t", text: "hola" } },
      ]),
      NEGOCIO,
    );
    expect(ev).toHaveLength(1);
    const fecha = ev[0]?.clase === "mensaje" ? ev[0].m.fecha : "";
    expect(new Date(fecha).toISOString()).toBe(fecha);
  });
});
