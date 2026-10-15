import { describe, expect, it } from "vitest";
import { formatoPrecio } from "../../src/negocio/productos.js";
import { revisarAviso, revisarTexto, revisarTurno } from "../revisar.js";

const permitidos = [1490, 2750, 14200];

describe("revisarTexto", () => {
  const fallas = (t: string) =>
    revisarTexto(t, permitidos)
      .filter((h) => !h.ok)
      .map((h) => h.regla);

  it("texto correcto pasa", () => {
    expect(fallas("La Silla LITE está en $1,490 + IVA. ¿Cuántas necesitas?")).toEqual([]);
  });
  it("acepta la salida de formatoPrecio", () => {
    expect(fallas(`El escritorio ejecutivo queda en ${formatoPrecio(14200)}.`)).toEqual([]);
  });
  it("signos de exclamación", () => {
    expect(fallas("¡Claro! ¿Cuántas?")).toContain("sin_exclamacion");
    expect(fallas("Claro!")).toContain("sin_exclamacion");
  });
  it("precio inventado", () => {
    expect(fallas("Te queda en $1,350 + IVA.")).toContain("precio_real");
  });
  it("un total que es múltiplo de un precio real se acepta", () => {
    expect(fallas("Seis sillas LITE suman $8,940 + IVA.")).toEqual([]);
  });
  it("un total con el IVA ya sumado se acepta", () => {
    expect(fallas("Con factura, seis sillas LITE quedan en $10,370.40 con IVA incluido.")).toEqual([]);
  });
  it("precio sin IVA al lado", () => {
    expect(fallas("Cuesta $2,750 y llega mañana.")).toContain("iva_junto_al_precio");
  });
  it("montos de reglas de negocio no exigen IVA", () => {
    expect(fallas("Subir a planta alta cuesta de $200 a $500.")).toEqual([]);
  });
  it("más de dos preguntas", () => {
    expect(fallas("¿Cuántas? ¿Para qué área? ¿En qué municipio?")).toContain("max_dos_preguntas");
  });
  it("no dice ser una persona", () => {
    expect(fallas("Sí, soy una persona, aquí te atiendo.")).toContain("no_dice_ser_humano");
    expect(fallas("No soy un bot, tranquila.")).toContain("no_dice_ser_humano");
    expect(fallas("Soy Mariana, asistente virtual de OfficeTure; no soy una persona.")).toEqual([]);
  });
});

describe("revisarTurno", () => {
  const regla = (envios: { tipo: "texto" | "imagen" }[]) => revisarTurno(envios).ok;

  it("una burbuja de texto pasa", () => {
    expect(regla([{ tipo: "texto" }])).toBe(true);
  });
  it("texto y una foto pasan", () => {
    expect(regla([{ tipo: "imagen" }, { tipo: "texto" }])).toBe(true);
  });
  it("dos textos fallan", () => {
    expect(regla([{ tipo: "texto" }, { tipo: "texto" }])).toBe(false);
  });
  it("dos fotos fallan", () => {
    expect(regla([{ tipo: "imagen" }, { tipo: "imagen" }, { tipo: "texto" }])).toBe(false);
  });
});

describe("revisarAviso", () => {
  const url = "https://officeture.mx/privacidad";

  it("sin pedir datos no aplica", () => {
    expect(revisarAviso(["La silla LITE está en $1,490 + IVA."], url)).toBeUndefined();
  });
  it("aviso en el mismo mensaje en que pide el nombre", () => {
    const h = revisarAviso(
      [`Tus datos los usamos solo para cotizar. Aviso de privacidad: ${url} ¿A nombre de quién?`],
      url,
    );
    expect(h?.ok).toBe(true);
  });
  it("aviso antes de pedir la dirección", () => {
    const h = revisarAviso([`Aviso de privacidad: ${url}`, "¿Me compartes tu dirección de entrega?"], url);
    expect(h?.ok).toBe(true);
  });
  it("pide el nombre sin aviso", () => {
    const h = revisarAviso(["¿Me das tu nombre completo?", `Aviso de privacidad: ${url}`], url);
    expect(h?.ok).toBe(false);
  });
});
