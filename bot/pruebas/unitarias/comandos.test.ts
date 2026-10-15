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
  it("teléfonos válidos en varios formatos", () => {
    for (const t of ["8112345678", "+52 1 81 1234 5678", "+5218112345678", "81 1234 5678", "81-1234-5678"]) {
      expect(parsearComando(`/bot ${t}`)).toEqual({ tipo: "bot", ref: "8112345678" });
    }
  });
  it("teléfono mal escrito es desconocido, no usa la alerta citada", () => {
    for (const t of [
      "123456",
      "81123",
      "123456789",
      "1234567",
      "811234567",
      "81123456789",
      "+52 81 1234 567",
    ]) {
      for (const c of ["bot", "pausa", "ganado", "perdido"]) {
        if (c === "perdido" && t.replace(/\D/g, "").length < 7) continue; // texto libre

        expect(parsearComando(`/${c} ${t}`)).toEqual({ tipo: "desconocido" });
      }
    }
    expect(parsearComando("/bot 81123456789012")).toEqual({ tipo: "desconocido" });
  });
  it("texto libre corto con dígitos sigue siendo motivo", () => {
    expect(parsearComando("/perdido 3000 precio")).toEqual({ tipo: "perdido", motivo: "3000 precio" });
    expect(parsearComando("/perdido 8112345678 pidió 3000")).toEqual({
      tipo: "perdido",
      ref: "8112345678",
      motivo: "pidió 3000",
    });
  });
  it("ignora formato de WhatsApp alrededor del mensaje", () => {
    expect(parsearComando("*/bot 8112345678*")).toEqual({ tipo: "bot", ref: "8112345678" });
    expect(parsearComando("_/pausa_")).toEqual({ tipo: "pausa" });
    expect(parsearComando("~*/ganado 81 1234 5678*~")).toEqual({ tipo: "ganado", ref: "8112345678" });
  });
});
