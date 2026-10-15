export const MOTIVOS_INMEDIATOS = [
  "listo_para_comprar",
  "descuento",
  "mismo_dia",
  "volumen_10",
  "instalacion_especial",
  "fuera_de_inventario",
  "a_medida",
  "queja",
  "proyecto",
  "quiere_pagar",
  "pide_humano",
  "no_entiende",
  "molesto",
  "fuera_de_zona",
  "proveedor",
  "error_modelo",
] as const;

export const MOTIVOS_MARCADOR = ["volumen_4", "factura", "planta_alta"] as const;

export type MotivoInmediato = (typeof MOTIVOS_INMEDIATOS)[number];
export type MotivoMarcador = (typeof MOTIVOS_MARCADOR)[number];

/** Motivos que Claude puede usar en la herramienta escalar (error_modelo lo dispara el sistema). */
export const MOTIVOS_PARA_MODELO = MOTIVOS_INMEDIATOS.filter((m) => m !== "error_modelo");

const ETIQUETAS: Record<MotivoInmediato | MotivoMarcador, string> = {
  listo_para_comprar: "Listo para comprar",
  descuento: "Pide descuento",
  mismo_dia: "Quiere entrega hoy",
  volumen_10: "10 piezas o más",
  instalacion_especial: "Instalación especial",
  fuera_de_inventario: "Producto fuera de inventario",
  a_medida: "Mueble a medida",
  queja: "Queja",
  proyecto: "Proyecto completo",
  quiere_pagar: "Quiere pagar",
  pide_humano: "Pide hablar con una persona",
  no_entiende: "El asistente no entendió",
  molesto: "Cliente molesto",
  fuera_de_zona: "Fuera de zona de entrega",
  proveedor: "Proveedor",
  error_modelo: "Falla técnica del asistente",
  volumen_4: "4 a 9 piezas",
  factura: "Requiere factura",
  planta_alta: "Planta alta",
};

export const etiquetaMotivo = (m: string): string => ETIQUETAS[m as MotivoInmediato] ?? m;

const DE_PEDIDO = new Set<string>([
  "listo_para_comprar",
  "quiere_pagar",
  "volumen_10",
  "descuento",
  "mismo_dia",
  "proyecto",
]);

export function textoVencimiento(motivo: string): string {
  return DE_PEDIDO.has(motivo)
    ? "Bryan sigue revisando tu pedido. Mientras tanto te ayudo con cualquier duda."
    : "Ya estoy de vuelta. Dime en qué te ayudo.";
}
