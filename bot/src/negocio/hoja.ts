import { type Categoria, type Producto, sinAcentos, type Uso } from "./productos.js";

const OBLIGATORIAS = [
  "Categoria",
  "Subcategoria",
  "Producto",
  "Precio_MXN",
  "Stock",
  "Prioridad_Venta",
] as const;

// Uso recomendado por subcategoría, tomado del cerebro de Tadeo.
const USO_POR_SUBCATEGORIA: Record<string, Uso[]> = {
  lineal: ["colaboradores", "administracion"],
  ejecutivo: ["direccion"],
  secretarial: ["recepcion", "administracion"],
  "semi ejecutivo": ["direccion", "administracion"],
  archivero: ["archivo", "administracion"],
  ejecutiva: ["direccion"],
  operativa: ["colaboradores", "administracion"],
  multiusos: ["visitas", "recepcion", "capacitacion"],
};

export const slug = (s: string): string =>
  sinAcentos(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function categoria(cat: string, sub: string): Categoria {
  if (sinAcentos(cat).includes("silla")) return "silla";
  return sinAcentos(sub).includes("archivero") ? "archivero" : "escritorio";
}

function stock(s: string): Producto["stock"] {
  const n = sinAcentos(s);
  if (n.includes("proveedor")) return "proveedor";
  if (n.includes("alto")) return "alto";
  if (n.includes("medio")) return "medio";
  return "bajo";
}

const prioridad = (s: string): Producto["prioridad"] => {
  const n = sinAcentos(s);
  return n.includes("alta") ? "alta" : n.includes("media") ? "media" : "baja";
};

export function mapearHoja(filas: string[][]): { productos: Producto[]; errores: string[] } {
  const [encabezado = [], ...resto] = filas;
  const col = new Map(encabezado.map((h, i) => [h.trim(), i]));
  const faltan = OBLIGATORIAS.filter((h) => !col.has(h));
  if (faltan.length > 0) throw new Error(`Faltan columnas en la hoja: ${faltan.join(", ")}`);
  const leer = (fila: string[], h: string): string => {
    const i = col.get(h);
    return i === undefined ? "" : (fila[i] ?? "").trim();
  };

  const productos: Producto[] = [];
  const errores: string[] = [];
  for (const fila of resto) {
    const nombre = leer(fila, "Producto");
    if (!nombre) continue;
    const precio = Number(leer(fila, "Precio_MXN").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(precio) || precio <= 0) {
      errores.push(`Precio inválido en «${nombre}»: ${leer(fila, "Precio_MXN")}`);
      continue;
    }
    const sub = leer(fila, "Subcategoria");
    const p: Producto = {
      slug: slug(nombre),
      categoria: categoria(leer(fila, "Categoria"), sub),
      subcategoria: sub,
      nombre,
      precio,
      stock: stock(leer(fila, "Stock")),
      prioridad: prioridad(leer(fila, "Prioridad_Venta")),
      uso: USO_POR_SUBCATEGORIA[sinAcentos(sub)] ?? [],
      activo: sinAcentos(leer(fila, "Activo")) !== "no",
    };
    const opcionales: [keyof Producto, string][] = [
      ["respuestaBase", "Respuesta_Chatbot_Base"],
      ["medidas", "Medidas"],
      ["colores", "Colores"],
      ["fotoUrl", "Foto_URL"],
    ];
    for (const [campo, h] of opcionales) {
      const v = leer(fila, h);
      if (v) Object.assign(p, { [campo]: v });
    }
    productos.push(p);
  }
  return { productos, errores };
}
