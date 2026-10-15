export type Categoria = "escritorio" | "archivero" | "silla";
export type Uso =
  | "colaboradores"
  | "direccion"
  | "recepcion"
  | "administracion"
  | "visitas"
  | "capacitacion"
  | "archivo";
export const USOS: Uso[] = [
  "colaboradores",
  "direccion",
  "recepcion",
  "administracion",
  "visitas",
  "capacitacion",
  "archivo",
];

export interface Producto {
  slug: string;
  categoria: Categoria;
  subcategoria: string;
  nombre: string;
  precio: number; // MXN sin IVA
  stock: "alto" | "medio" | "bajo" | "proveedor";
  prioridad: "alta" | "media" | "baja";
  uso: Uso[];
  respuestaBase?: string;
  medidas?: string;
  colores?: string;
  fotoUrl?: string;
  activo: boolean;
}

export interface FiltroProductos {
  categoria?: Categoria;
  subcategoria?: string;
  uso?: Uso;
  presupuestoMax?: number;
  texto?: string;
  limite?: number;
}

const ORDEN_PRIORIDAD = { alta: 0, media: 1, baja: 2 } as const;
export const sinAcentos = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filtrarProductos(productos: Producto[], f: FiltroProductos): Producto[] {
  return productos
    .filter((p) => p.activo)
    .filter((p) => !f.categoria || p.categoria === f.categoria)
    .filter((p) => !f.subcategoria || sinAcentos(p.subcategoria).includes(sinAcentos(f.subcategoria)))
    .filter((p) => !f.uso || p.uso.includes(f.uso))
    .filter((p) => f.presupuestoMax === undefined || p.precio <= f.presupuestoMax)
    .filter((p) => !f.texto || sinAcentos(p.nombre).includes(sinAcentos(f.texto)))
    .sort((a, b) => ORDEN_PRIORIDAD[a.prioridad] - ORDEN_PRIORIDAD[b.prioridad] || a.precio - b.precio)
    .slice(0, f.limite ?? 5);
}

export const formatoPrecio = (n: number): string => `$${n.toLocaleString("en-US")} + IVA`;
