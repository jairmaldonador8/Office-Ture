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
  it("los montos de maniobras solo valen hablando de planta alta, maniobras o piso", () => {
    expect(fallas("Subir a planta alta cuesta de $200 a $500 por maniobras.")).toEqual([]);
    expect(fallas("Te lo dejo en $200 + IVA.")).toContain("precio_real");
    expect(fallas("Te lo dejo en $500 + IVA.")).toContain("precio_real");
  });
  it("múltiplos solo hasta 20 piezas", () => {
    expect(fallas("Veinte sillas LITE suman $29,800 + IVA.")).toEqual([]);
    expect(fallas("Cuarenta sillas LITE suman $59,600 + IVA.")).toContain("precio_real");
  });
  it("totales mixtos solo si el escenario los declara", () => {
    const t = "Dos sillas LITE y un escritorio lineal suman $5,730 + IVA.";
    expect(fallas(t)).toContain("precio_real");
    const ok = revisarTexto(t, permitidos, { montosPermitidos: [5730] });
    expect(ok.filter((h) => !h.ok)).toEqual([]);
  });
  it("lista de precios con un solo + IVA al final", () => {
    expect(fallas("Hay sillas de $1,490 y $2,750 + IVA.")).toEqual([]);
  });
  it("rango con + IVA al final", () => {
    expect(fallas("Van de $1,490 a $14,200 + IVA, según el modelo.")).toEqual([]);
  });
  it("el + IVA de otra oración no cubre el precio", () => {
    expect(fallas("Cuesta $2,750. Todos los precios son más IVA.")).toContain("iva_junto_al_precio");
  });
  it("el presupuesto del cliente repetido no exige IVA ni ser real", () => {
    const r = revisarTexto("Entiendo que tienes $8,000 para esto.", permitidos, {
      presupuestoCliente: [8000],
    });
    expect(r.filter((h) => !h.ok)).toEqual([]);
  });
  it("un precio con IVA incluido no exige + IVA", () => {
    expect(fallas("Son $1,350 con IVA incluido.")).toContain("precio_real");
    expect(fallas("Con IVA, seis sillas LITE quedan en $10,370.40 IVA incluido.")).toEqual([]);
  });
  it("más de dos preguntas", () => {
    expect(fallas("¿Cuántas? ¿Para qué área? ¿En qué municipio?")).toContain("max_dos_preguntas");
  });
  it("no dice ser una persona", () => {
    expect(fallas("Sí, soy una persona, aquí te atiendo.")).toContain("no_dice_ser_humano");
    expect(fallas("No soy un bot, tranquila.")).toContain("no_dice_ser_humano");
    expect(fallas("Soy Mariana, asistente virtual de OfficeTure; no soy una persona.")).toEqual([]);
  });
  it.each([
    "Soy de carne y hueso, no te preocupes.",
    "Soy una asesora de OfficeTure.",
    "Soy un vendedor de la tienda.",
    "Soy una persona real.",
    "Te atiende una persona real.",
    "Hola, soy Bryan, te ayudo.",
  ])("dice ser humano: %s", (t) => {
    expect(fallas(t)).toContain("no_dice_ser_humano");
  });
  it("no soy una persona y soy asistente virtual pasan", () => {
    expect(fallas("Aún no soy una persona, soy asistente virtual de OfficeTure.")).toEqual([]);
    expect(fallas("Soy asistente virtual; Bryan es quien confirma.")).toEqual([]);
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
  it.each([
    "Compárteme tu nombre completo.",
    "Pásame tu dirección de entrega.",
    "Mándame tu correo y te mando la cotización.",
    "Dame tu teléfono para avisarte.",
    "Me das tus datos de contacto",
    "Me compartes tu WhatsApp",
    "Regálame el nombre de la empresa.",
  ])("pide datos sin signo de pregunta: %s", (t) => {
    expect(revisarAviso([t], url)?.ok).toBe(false);
  });
  it("pedir el número de piezas no es dato personal", () => {
    expect(revisarAviso(["Dime el número de piezas que necesitas."], url)).toBeUndefined();
  });
  it("pide el nombre sin aviso", () => {
    const h = revisarAviso(["¿Me das tu nombre completo?", `Aviso de privacidad: ${url}`], url);
    expect(h?.ok).toBe(false);
  });
});
