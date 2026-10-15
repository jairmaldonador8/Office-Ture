import { describe, expect, it } from "vitest";
import { parsearComando } from "../../src/flujo/comandos.js";

describe("parsearComando", () => {
  it("no es comando si no empieza con /", () => {
    expect(parsearComando("ok gracias")).toBeNull();
  });
  it("comandos con teléfono", () => {
    expect(parsearComando("/bot 81 1234 5678")).toEqual({ tipo: "bot", ref: "8112345678" });
    expect(parsearComando("/PAUSA 5218112345678")).toEqual({ tipo: "pausa", ref: "8112345678" });
    expect(parsearComando("/ganado 8112345678")).toEqual({ tipo: "ganado", ref: "8112345678" });
  });
  it("comandos con usuario de Instagram", () => {
    expect(parsearComando("/bot @laura.oficina")).toEqual({ tipo: "bot", ref: "@laura.oficina" });
  });
  it("perdido con motivo libre", () => {
    expect(parsearComando("/perdido 8112345678 precio alto")).toEqual({
      tipo: "perdido",
      ref: "8112345678",
      motivo: "precio alto",
    });
  });
  it("sin referencia (respondiendo a la alerta)", () => {
    expect(parsearComando("/ganado")).toEqual({ tipo: "ganado" });
    expect(parsearComando("/perdido se fue con otro")).toEqual({
      tipo: "perdido",
      motivo: "se fue con otro",
    });
  });
  it("ayuda y desconocido", () => {
    expect(parsearComando("/ayuda")).toEqual({ tipo: "ayuda" });
    expect(parsearComando("/hola")).toEqual({ tipo: "desconocido" });
  });
});
