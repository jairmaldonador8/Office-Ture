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

const norm = (s: string): string =>
  sinAcentos(s)
    .replace(/[\s_]+/g, " ")
    .trim();

function categoria(cat: string, sub: string): Categoria | undefined {
  const c = sinAcentos(cat);
  if (c.includes("silla")) return "silla";
  if (c.includes("escritorio") || c.includes("archivero"))
    return sinAcentos(sub).includes("archivero") ? "archivero" : "escritorio";
  return undefined;
}

// undefined = valor desconocido; null = agotado (el tipo Stock no lo admite)
function stock(s: string): Producto["stock"] | null | undefined {
  const n = sinAcentos(s).trim();
  if (n === "0" || n.includes("agotad") || n.includes("sin stock") || n.includes("sin existencia"))
    return null;
  if (n.includes("proveedor")) return "proveedor";
  if (n.includes("alto")) return "alto";
  if (n.includes("medio")) return "medio";
  if (n.includes("bajo")) return "bajo";
  return undefined;
}

function prioridad(s: string): Producto["prioridad"] | undefined {
  const n = sinAcentos(s).trim();
  if (n === "alta") return "alta";
  if (n === "media") return "media";
  if (n === "baja") return "baja";
  return undefined;
}

const PRECIO_MX = /^(?:\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$/;

function precioMX(crudo: string): number | undefined {
  let t = crudo.replace(/\$/g, "").trim();
  for (let previo = ""; previo !== t; ) {
    previo = t;
    t = t.replace(/(?:\+\s*iva|iva|mxn)\s*$/i, "").trim();
  }
  t = t.replace(/\s+/g, "");
  if (!PRECIO_MX.test(t)) return undefined;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const INACTIVO = new Set(["no", "inactivo", "false", "0", "n"]);

export function mapearHoja(filas: string[][]): { productos: Producto[]; errores: string[] } {
  const [encabezado = [], ...resto] = filas;
  const col = new Map<string, number>();
  encabezado.forEach((h, i) => {
    const k = norm(h);
    if (!col.has(k)) col.set(k, i);
  });
  const faltan = OBLIGATORIAS.filter((h) => !col.has(norm(h)));
  if (faltan.length > 0) throw new Error(`Faltan columnas en la hoja: ${faltan.join(", ")}`);
  const leer = (fila: string[], h: string): string => {
    const i = col.get(norm(h));
    return i === undefined ? "" : (fila[i] ?? "").trim();
  };

  const productos: Producto[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  for (const fila of resto) {
    const nombre = leer(fila, "Producto");
    if (!nombre) continue;
    const crudo = leer(fila, "Precio_MXN");
    const precio = precioMX(crudo);
    if (precio === undefined) {
      errores.push(`Precio inválido en «${nombre}»: «${crudo}»`);
      continue;
    }
    const sub = leer(fila, "Subcategoria");
    const cat = categoria(leer(fila, "Categoria"), sub);
    if (!cat) {
      errores.push(`Categoría desconocida en «${nombre}»: «${leer(fila, "Categoria")}»`);
      continue;
    }
    const st = stock(leer(fila, "Stock"));
    if (st === null) {
      errores.push(`«${nombre}» está agotado en la hoja (Stock «${leer(fila, "Stock")}»); no se carga`);
      continue;
    }
    if (st === undefined) {
      errores.push(`Stock desconocido en «${nombre}»: «${leer(fila, "Stock")}»`);
      continue;
    }
    const clave = slug(nombre);
    if (!clave) {
      errores.push(`Nombre sin letras ni números en «${nombre}»; no se puede crear su slug`);
      continue;
    }
    if (vistos.has(clave)) {
      errores.push(`Producto repetido «${nombre}» (slug «${clave}»); se conserva la primera fila`);
      continue;
    }
    vistos.add(clave);
    let prio = prioridad(leer(fila, "Prioridad_Venta"));
    if (!prio) {
      errores.push(
        `Aviso: Prioridad_Venta desconocida en «${nombre}» («${leer(fila, "Prioridad_Venta")}»); se usa baja`,
      );
      prio = "baja";
    }
    const uso = USO_POR_SUBCATEGORIA[sinAcentos(sub)];
    if (!uso) errores.push(`Aviso: subcategoría desconocida en «${nombre}»: «${sub}»; sin uso recomendado`);
    const activo = sinAcentos(leer(fila, "Activo"))
      .replace(/[\s.,;!]+$/, "")
      .trim();
    const p: Producto = {
      slug: clave,
      categoria: cat,
      subcategoria: sub,
      nombre,
      precio,
      stock: st,
      prioridad: prio,
      uso: uso ?? [],
      activo: !INACTIVO.has(activo),
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
