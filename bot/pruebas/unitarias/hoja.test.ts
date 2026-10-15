import { describe, expect, it } from "vitest";
import { mapearHoja } from "../../src/negocio/hoja.js";

const enc = [
  "Categoria",
  "Subcategoria",
  "Producto",
  "Precio_MXN",
  "IVA",
  "Precio_Publico",
  "Disponibilidad",
  "Stock",
  "Prioridad_Venta",
  "Respuesta_Chatbot_Base",
];

describe("mapearHoja", () => {
  it("mapea escritorios, archivero y sillas con uso derivado", () => {
    const { productos, errores } = mapearHoja([
      enc,
      [
        "Escritorios y archiveros",
        "Lineal",
        "Escritorio lineal estructura metálica",
        "$2,750",
        "+ IVA",
        "$2,750 + IVA",
        "Entrega inmediata",
        "Alto",
        "Alta",
        "Sí, tenemos…",
      ],
      [
        "Escritorios y archiveros",
        "Archivero",
        "Archivero vertical de 4 gavetas",
        "$5,200",
        "+ IVA",
        "",
        "Entrega inmediata",
        "Alto",
        "Alta",
        "",
      ],
      [
        "Sillas",
        "Multiusos",
        "Silla NÁPOLES",
        "$1,290",
        "+ IVA",
        "",
        "Entrega inmediata",
        "Disponible con proveedor",
        "Alta",
        "",
      ],
    ]);
    expect(errores).toEqual([]);
    expect(productos[0]).toMatchObject({
      slug: "escritorio-lineal-estructura-metalica",
      categoria: "escritorio",
      precio: 2750,
      stock: "alto",
      prioridad: "alta",
      uso: ["colaboradores", "administracion"],
      activo: true,
    });
    expect(productos[1]).toMatchObject({ categoria: "archivero", uso: ["archivo", "administracion"] });
    expect(productos[2]).toMatchObject({
      slug: "silla-napoles",
      categoria: "silla",
      stock: "proveedor",
      uso: ["visitas", "recepcion", "capacitacion"],
    });
  });

  it("lee columnas opcionales y Activo = No", () => {
    const { productos } = mapearHoja([
      [...enc, "Medidas", "Colores", "Foto_URL", "Activo"],
      [
        "Sillas",
        "Ejecutiva",
        "Silla MESH",
        "4200",
        "",
        "",
        "",
        "Disponible con proveedor",
        "Alta",
        "",
        "60 x 60 cm",
        "Negro",
        "https://x/mesh.jpg",
        "No",
      ],
    ]);
    expect(productos[0]).toMatchObject({
      medidas: "60 x 60 cm",
      colores: "Negro",
      fotoUrl: "https://x/mesh.jpg",
      activo: false,
    });
  });

  it("reporta filas con precio inválido y las omite", () => {
    const { productos, errores } = mapearHoja([
      enc,
      ["Sillas", "Operativa", "Silla X", "consultar", "", "", "", "Alto", "Alta", ""],
    ]);
    expect(productos).toEqual([]);
    expect(errores[0]).toContain("Silla X");
  });

  it("falla si faltan encabezados obligatorios", () => {
    expect(() => mapearHoja([["Producto", "Precio"]])).toThrow(/Categoria/);
  });
});
