import { describe, expect, it } from "vitest";
import { aMensajesClaude } from "../../src/cerebro/historial.js";
import type { Mensaje } from "../../src/datos/tipos.js";

let n = 0;
const m = (autor: Mensaje["autor"], texto: string, extra: Partial<Mensaje> = {}): Mensaje => ({
  id: `m${++n}`,
  conversacionId: "c",
  hilo: 1,
  autor,
  tipo: "texto",
  texto,
  creado: new Date(n),
  ...extra,
});

describe("aMensajesClaude", () => {
  it("une mensajes seguidos del mismo rol y marca los de Bryan", () => {
    const r = aMensajesClaude(
      [
        m("cliente", "hola"),
        m("cliente", "busco sillas"),
        m("bot", "¿Cuántas?"),
        m("humano", "Yo te atiendo"),
        m("cliente", "6"),
      ],
      new Map(),
    );
    expect(r).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "hola" },
          { type: "text", text: "busco sillas" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "¿Cuántas?" },
          { type: "text", text: "[Bryan escribió]: Yo te atiendo" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "6" }] },
    ]);
  });

  it("descarta asistentes iniciales y mensajes de sistema", () => {
    const r = aMensajesClaude([m("bot", "seguimiento"), m("sistema", "x"), m("cliente", "sí")], new Map());
    expect(r).toEqual([{ role: "user", content: [{ type: "text", text: "sí" }] }]);
  });

  it("incluye imágenes disponibles como bloque base64", () => {
    const foto = m("cliente", "mi oficina", {
      tipo: "imagen",
      adjunto: { ruta: "c/a.jpg", mime: "image/jpeg" },
    });
    const r = aMensajesClaude([foto], new Map([[foto.id, { base64: "QUJD", mime: "image/jpeg" }]]));
    expect(r[0]?.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } },
      { type: "text", text: "mi oficina" },
    ]);
  });

  it("imagen sin bytes disponibles se describe con texto", () => {
    const r = aMensajesClaude([m("cliente", "", { tipo: "imagen" })], new Map());
    expect(r[0]?.content).toEqual([{ type: "text", text: "[el cliente mandó una imagen antes]" }]);
  });

  it("foto del bot se marca como enviada, sin placeholder de cliente", () => {
    const r = aMensajesClaude(
      [
        m("cliente", "hola"),
        m("bot", "Mira este modelo", { tipo: "imagen" }),
        m("bot", "", { tipo: "imagen" }),
      ],
      new Map(),
    );
    expect(r[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "[se envió una foto del producto]" },
        { type: "text", text: "Mira este modelo" },
        { type: "text", text: "[se envió una foto del producto]" },
      ],
    });
  });

  it("foto de Bryan se marca como enviada y conserva el prefijo en el pie", () => {
    const foto = m("humano", "Así queda", {
      tipo: "imagen",
      adjunto: { ruta: "c/b.jpg", mime: "image/jpeg" },
    });
    const r = aMensajesClaude(
      [m("cliente", "hola"), foto],
      new Map([[foto.id, { base64: "QUJD", mime: "image/jpeg" }]]),
    );
    expect(r[1]?.content).toEqual([
      { type: "text", text: "[se envió una foto del producto]" },
      { type: "text", text: "[Bryan escribió]: Así queda" },
    ]);
  });
});
