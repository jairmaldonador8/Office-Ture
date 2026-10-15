import { describe, expect, it } from "vitest";
import { sistemaDinamico, sistemaEstatico } from "../../src/cerebro/prompt.js";
import { leadVacio } from "../../src/datos/tipos.js";
import { aLocal } from "../../src/hora.js";

describe("prompt", () => {
  it("el bloque estático es idéntico entre llamadas y no trae hora ni datos del cliente", () => {
    const a = sistemaEstatico({ nombre: "Mariana", avisoUrl: "https://o.mx/p" });
    const b = sistemaEstatico({ nombre: "Mariana", avisoUrl: "https://o.mx/p" });
    expect(a).toBe(b);
    expect(a).toContain("Mariana");
    expect(a).toContain("https://o.mx/p");
    expect(a).not.toMatch(/\d{1,2}:\d{2} hrs/);
  });

  it("el bloque dinámico trae canal, hora, horario, anuncio y lead sin vacíos", () => {
    const d = sistemaDinamico({
      canal: "whatsapp",
      ahora: aLocal(2026, 9, 9, 10, 42),
      referencia: { titulo: "Sillas desde $1,490", cuerpo: "Entrega inmediata" },
      lead: { ...leadVacio("c1"), cantidad: 6, municipio: "Apodaca" },
      primerMensajeBot: true,
      nombreCliente: "Laura",
    });
    expect(d).toContain("Canal: whatsapp");
    expect(d).toContain("viernes 9 de octubre, 10:42");
    expect(d).toContain("Dentro de horario de atención: sí");
    expect(d).toContain("«Sillas desde $1,490»");
    expect(d).toContain('"cantidad":6');
    expect(d).not.toContain("prioritario");
    expect(d).toContain("Aviso de privacidad enviado: no");
    expect(d).toContain("Es tu primer mensaje en esta conversación: sí");
  });
});
