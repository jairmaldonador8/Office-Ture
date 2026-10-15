import { describe, expect, it } from "vitest";
import { parsearWhatsApp } from "../../src/canales/whatsapp.js";

const envolver = (field: string, value: object) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA", changes: [{ field, value: { messaging_product: "whatsapp", ...value } }] }],
});

describe("parsearWhatsApp", () => {
  it("texto con referencia de anuncio y nombre del perfil", () => {
    const ev = parsearWhatsApp(
      envolver("messages", {
        contacts: [{ wa_id: "5218112345678", profile: { name: "Laura" } }],
        messages: [
          {
            from: "5218112345678",
            id: "wamid.1",
            timestamp: "1791561600",
            type: "text",
            text: { body: "Hola, precio de sillas" },
            referral: {
              source_id: "ad1",
              headline: "Sillas desde $1,490",
              body: "Entrega inmediata",
              ctwa_clid: "c1",
            },
          },
        ],
      }),
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toEqual({
      clase: "mensaje",
      m: {
        canal: "whatsapp",
        idExterno: "wamid.1",
        de: "5218112345678",
        nombre: "Laura",
        tipo: "texto",
        texto: "Hola, precio de sillas",
        referencia: { id: "ad1", titulo: "Sillas desde $1,490", cuerpo: "Entrega inmediata", ctwaClid: "c1" },
        fecha: new Date(1791561600 * 1000).toISOString(),
      },
    });
  });

  it("imagen con pie, audio, ubicación, respuesta de botón y cita", () => {
    const ev = parsearWhatsApp(
      envolver("messages", {
        contacts: [{ wa_id: "521", profile: { name: "X" } }],
        messages: [
          {
            from: "521",
            id: "w2",
            timestamp: "1",
            type: "image",
            image: { id: "m1", mime_type: "image/jpeg", caption: "mi oficina" },
          },
          {
            from: "521",
            id: "w3",
            timestamp: "1",
            type: "audio",
            audio: { id: "m2", mime_type: "audio/ogg" },
          },
          {
            from: "521",
            id: "w4",
            timestamp: "1",
            type: "location",
            location: { latitude: 25.7, longitude: -100.3, name: "Oficina" },
          },
          {
            from: "521",
            id: "w5",
            timestamp: "1",
            type: "interactive",
            interactive: { type: "button_reply", button_reply: { id: "silla", title: "Sillas" } },
          },
          {
            from: "521",
            id: "w6",
            timestamp: "1",
            type: "text",
            text: { body: "/bot" },
            context: { id: "wamid.alerta" },
          },
        ],
      }),
    );
    const ms = ev.map((e) => (e.clase === "mensaje" ? e.m : null));
    expect(ms[0]).toMatchObject({ tipo: "imagen", mediaId: "m1", mime: "image/jpeg", texto: "mi oficina" });
    expect(ms[1]).toMatchObject({ tipo: "audio", mediaId: "m2", mime: "audio/ogg" });
    expect(ms[2]).toMatchObject({ tipo: "ubicacion", texto: "[ubicación] Oficina (25.7, -100.3)" });
    expect(ms[3]).toMatchObject({ tipo: "boton", texto: "Sillas" });
    expect(ms[4]).toMatchObject({ tipo: "texto", texto: "/bot", citaId: "wamid.alerta" });
  });

  it("eco de mensaje enviado por Bryan desde la app (coexistencia)", () => {
    const ev = parsearWhatsApp(
      envolver("smb_message_echoes", {
        message_echoes: [
          {
            from: "5218124283124",
            to: "5218112345678",
            id: "wamid.eco",
            timestamp: "2",
            type: "text",
            text: { body: "Hola, soy Bryan" },
          },
        ],
      }),
    );
    expect(ev).toEqual([
      {
        clase: "eco",
        e: {
          canal: "whatsapp",
          idExterno: "wamid.eco",
          para: "5218112345678",
          texto: "Hola, soy Bryan",
          fecha: new Date(2000).toISOString(),
        },
      },
    ]);
  });

  it("ignora estados de entrega y payloads desconocidos", () => {
    expect(parsearWhatsApp(envolver("messages", { statuses: [{ id: "w", status: "read" }] }))).toEqual([]);
    expect(parsearWhatsApp({ object: "page" })).toEqual([]);
    expect(parsearWhatsApp(null)).toEqual([]);
  });
});
