import { describe, expect, it } from "vitest";
import { enmascarar, enmascararId, errorSeguro } from "./log.js";

describe("enmascarar", () => {
  it("reduce series de 7 o más dígitos a «…» y los últimos 4", () => {
    expect(enmascarar("a 5218124283124 falló")).toBe("a …3124 falló");
    expect(enmascarar("8112345 y 1234567890")).toBe("…2345 y …7890");
  });
  it("no toca números cortos", () => {
    expect(enmascarar("fila 123456, id 42")).toBe("fila 123456, id 42");
  });
});

describe("errorSeguro", () => {
  it("usa el mensaje de un Error y lo enmascara", () => {
    expect(errorSeguro(new Error("no se pudo enviar a 5218124283124"))).toBe("no se pudo enviar a …3124");
  });
  it("convierte lo que no es Error", () => {
    expect(errorSeguro("tel 5218124283124")).toBe("tel …3124");
    expect(errorSeguro(undefined)).toBe("undefined");
  });
});

describe("enmascararId", () => {
  it("deja solo los últimos 4 caracteres", () => {
    expect(enmascararId("IGSID98765")).toBe("***8765");
  });
});
