import { describe, expect, it } from "vitest";
import { elegirPendiente } from "../../src/datos/eco.js";
import type { Mensaje } from "../../src/datos/tipos.js";

const fila = (id: string, segundo: number, extra: Partial<Mensaje> = {}): Mensaje => ({
  id,
  conversacionId: "c",
  hilo: 1,
  autor: "bot",
  tipo: "texto",
  creado: new Date(segundo * 1000),
  ...extra,
});

describe("elegirPendiente", () => {
  it("con varios textos iguales pendientes toma el más antiguo", () => {
    const pendientes = [fila("b", 2, { texto: "Hola" }), fila("a", 1, { texto: "Hola" })];
    expect(elegirPendiente(pendientes, { texto: "Hola", esImagen: false })?.id).toBe("a");
  });

  it("imagen con pie solo coincide con una imagen de pie igual (normalizado)", () => {
    const pendientes = [
      fila("a", 1, { tipo: "imagen", texto: "Silla LITE" }),
      fila("b", 2, { tipo: "imagen", texto: "Escritorio  lineal" }),
    ];
    expect(elegirPendiente(pendientes, { texto: " Escritorio lineal ", esImagen: true })?.id).toBe("b");
    expect(elegirPendiente(pendientes, { texto: "Otra foto", esImagen: true })).toBeNull();
  });

  it("imagen con pie también coincide con el pie recortado como en Instagram", () => {
    const largo = "á".repeat(600);
    const pendientes = [fila("a", 1, { tipo: "imagen", texto: largo })];
    expect(elegirPendiente(pendientes, { texto: `${"á".repeat(498)}...`, esImagen: true })?.id).toBe("a");
  });

  it("imagen sin pie toma la imagen pendiente más antigua, tenga pie o no", () => {
    const pendientes = [
      fila("b", 2, { tipo: "imagen" }),
      fila("a", 1, { tipo: "imagen", texto: "Silla LITE" }),
      fila("t", 0, { texto: "Hola" }),
    ];
    expect(elegirPendiente(pendientes, { esImagen: true })?.id).toBe("a");
  });
});
