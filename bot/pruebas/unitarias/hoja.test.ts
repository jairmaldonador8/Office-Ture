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

describe("mapearHoja endurecida", () => {
  const fila = (o: Partial<Record<string, string>> = {}): string[] => {
    const v: Record<string, string | undefined> = {
      Categoria: "Sillas",
      Subcategoria: "Operativa",
      Producto: "Silla X",
      Precio_MXN: "1490",
      Stock: "Alto",
      Prioridad_Venta: "Alta",
      ...o,
    };
    return ["Categoria", "Subcategoria", "Producto", "Precio_MXN", "Stock", "Prioridad_Venta"].map(
      (h) => v[h] ?? "",
    );
  };
  const enc6 = ["Categoria", "Subcategoria", "Producto", "Precio_MXN", "Stock", "Prioridad_Venta"];
  const una = (o: Partial<Record<string, string>>) => mapearHoja([enc6, fila(o)]);

  it.each(["$1.490,00", "$2,75", "0x10", "1e3", "Consultar", "N/A", "", "0", "-5", "1,49", "12,34,567"])(
    "rechaza el precio %j",
    (p) => {
      const r = una({ Precio_MXN: p });
      expect(r.productos).toEqual([]);
      expect(r.errores[0]).toContain("Silla X");
    },
  );

  it.each([
    ["$2,750", 2750],
    ["2750.00", 2750],
    ["2 750", 2750],
    ["2 750", 2750],
    ["$1,490.00", 1490],
    ["$1,490 + IVA", 1490],
    ["1490 MXN", 1490],
    ["1,234,567.5", 1234567.5],
  ])("acepta el precio %j", (p, n) => {
    const r = una({ Precio_MXN: p });
    expect(r.errores).toEqual([]);
    expect(r.productos[0]?.precio).toBe(n);
  });

  it("rechaza categoría desconocida", () => {
    const r = una({ Categoria: "Cocinas" });
    expect(r.productos).toEqual([]);
    expect(r.errores[0]).toContain("Silla X");
  });

  it.each(["", "Quizá", "Agotado", "Sin stock", "0"])("rechaza el stock %j", (s) => {
    const r = una({ Stock: s });
    expect(r.productos).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });

  it("prioridad desconocida queda en baja con aviso", () => {
    const r = una({ Prioridad_Venta: "urgente" });
    expect(r.productos[0]?.prioridad).toBe("baja");
    expect(r.errores[0]).toMatch(/^Aviso:/);
  });

  it("subcategoría desconocida se conserva con aviso", () => {
    const r = una({ Subcategoria: "Rara" });
    expect(r.productos[0]?.subcategoria).toBe("Rara");
    expect(r.errores[0]).toMatch(/^Aviso:/);
  });

  it.each(["no", "No.", "inactivo", "FALSE", "0", "n", " N "])("Activo %j es inactivo", (a) => {
    const r = mapearHoja([
      [...enc6, "Activo"],
      [...fila(), a],
    ]);
    expect(r.productos[0]?.activo).toBe(false);
  });

  it("Activo vacío o sí es activo", () => {
    expect(
      mapearHoja([
        [...enc6, "Activo"],
        [...fila(), ""],
      ]).productos[0]?.activo,
    ).toBe(true);
    expect(
      mapearHoja([
        [...enc6, "Activo"],
        [...fila(), "Sí"],
      ]).productos[0]?.activo,
    ).toBe(true);
  });

  it("rechaza slug repetido o vacío y conserva el primero", () => {
    const r = mapearHoja([
      enc6,
      fila({ Producto: "Silla NÁPOLES", Precio_MXN: "1000" }),
      fila({ Producto: "silla napoles", Precio_MXN: "9999" }),
      fila({ Producto: "***" }),
    ]);
    expect(r.productos).toHaveLength(1);
    expect(r.productos[0]?.precio).toBe(1000);
    expect(r.errores).toHaveLength(2);
  });

  it("encabezados tolerantes a acentos, mayúsculas y guiones bajos", () => {
    const r = mapearHoja([
      ["Categoría", "subcategoria", "PRODUCTO", "precio mxn", "Stock", "Prioridad Venta"],
      ["Sillas", "Operativa", "Silla Y", "1490", "Alto", "Alta"],
    ]);
    expect(r.errores).toEqual([]);
    expect(r.productos[0]).toMatchObject({ nombre: "Silla Y", precio: 1490 });
    expect(() => mapearHoja([["Categoria", "Producto"]])).toThrow(/Subcategoria/);
  });
});
