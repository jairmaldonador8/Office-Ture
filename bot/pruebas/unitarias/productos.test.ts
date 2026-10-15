import { describe, expect, it } from "vitest";
import { filtrarProductos, type Producto } from "../../src/negocio/productos.js";

const p = (o: Partial<Producto>): Producto => ({
  slug: "x",
  categoria: "silla",
  subcategoria: "Operativa",
  nombre: "Silla X",
  precio: 1000,
  stock: "proveedor",
  prioridad: "alta",
  uso: ["colaboradores"],
  activo: true,
  ...o,
});

const catalogo: Producto[] = [
  p({ slug: "lite", nombre: "Silla LITE", precio: 1490 }),
  p({ slug: "fly", nombre: "Silla FLY", precio: 2190 }),
  p({ slug: "mesh", nombre: "Silla MESH", subcategoria: "Ejecutiva", precio: 4200, uso: ["direccion"] }),
  p({
    slug: "move",
    nombre: "Silla MOVE",
    subcategoria: "Multiusos",
    precio: 690,
    uso: ["visitas", "capacitacion"],
  }),
  p({
    slug: "ejec",
    nombre: "Escritorio ejecutivo",
    categoria: "escritorio",
    subcategoria: "Ejecutivo",
    precio: 14200,
    prioridad: "media",
    uso: ["direccion"],
  }),
  p({ slug: "viejo", nombre: "Silla vieja", activo: false }),
];

describe("filtrarProductos", () => {
  it("filtra por categoría y excluye inactivos", () => {
    expect(filtrarProductos(catalogo, { categoria: "silla" }).map((x) => x.slug)).toEqual([
      "move",
      "lite",
      "fly",
      "mesh",
    ]);
  });
  it("filtra por uso y presupuesto, ordena por prioridad y luego precio", () => {
    expect(
      filtrarProductos(catalogo, { categoria: "silla", uso: "colaboradores", presupuestoMax: 2000 }).map(
        (x) => x.slug,
      ),
    ).toEqual(["lite"]);
  });
  it("busca por texto sin acentos ni mayúsculas", () => {
    expect(filtrarProductos(catalogo, { texto: "mesh" }).map((x) => x.slug)).toEqual(["mesh"]);
  });
  it("limita a 5 por defecto", () => {
    const muchos = Array.from({ length: 9 }, (_, i) => p({ slug: `s${i}`, precio: i }));
    expect(filtrarProductos(muchos, {})).toHaveLength(5);
  });
});
