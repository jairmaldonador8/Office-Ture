import type { ReferenciaAnuncio } from "../src/canales/tipos.js";

/** Un paso es un mensaje del cliente o, con `bryan`, un mensaje que Bryan manda desde su app (eco). */
export type Paso = string | { bryan: string };

export interface Espera {
  /** Motivo con que el asistente debe escalar. */
  escalar?: string;
  sinEscalar?: boolean;
  /** Marcador de prioridad que debe quedar en el lead. */
  marcador?: string;
  herramientas?: string[];
  /** Algún mensaje del asistente incluye este texto (sin distinguir mayúsculas). */
  textoIncluye?: string;
  /** Algún mensaje del asistente incluye todos estos textos a la vez. */
  incluyeTodos?: string[];
  /** Después del eco de Bryan el asistente no le vuelve a escribir al cliente. */
  callaTrasBryan?: boolean;
}

export interface Escenario {
  nombre: string;
  referencia?: ReferenciaAnuncio;
  /** Hora local de inicio: [año, mes 0-11, día, hora]. Por defecto viernes 9-oct-2026 10:00. */
  inicio?: [number, number, number, number];
  mensajes: Paso[];
  espera: Espera;
}

export const ESCENARIOS: Escenario[] = [
  {
    nombre: "anuncio-sillas",
    referencia: { id: "ad-sillas", titulo: "Sillas desde $1,490", cuerpo: "Entrega inmediata" },
    mensajes: ["Hola, precio de sillas", "Son 6 para mi equipo de ventas", "En Apodaca"],
    espera: { herramientas: ["buscar_productos"], marcador: "volumen_4", sinEscalar: true },
  },
  {
    nombre: "esta-caro",
    mensajes: ["Cuánto cuesta el escritorio ejecutivo", "Está caro, tengo como 8 mil"],
    espera: { herramientas: ["buscar_productos"], sinEscalar: true },
  },
  {
    nombre: "doce-sillas",
    mensajes: ["Necesito 12 sillas para una sala de capacitación"],
    espera: { escalar: "volumen_10" },
  },
  {
    nombre: "proyecto",
    mensajes: [
      "Vamos a equipar una oficina para 10 personas, nos cotizan todo?",
      "Escritorios, sillas y una sala de juntas",
      "En San Pedro, para noviembre",
    ],
    espera: { escalar: "proyecto" },
  },
  {
    nombre: "factura",
    mensajes: ["Quiero 2 escritorios lineales con factura", "Monterrey"],
    espera: { marcador: "factura" },
  },
  {
    nombre: "queja",
    mensajes: ["Me llegó una silla con la rueda rota, muy mal servicio"],
    espera: { escalar: "queja" },
  },
  {
    nombre: "descuento",
    mensajes: ["Cuánto la silla LITE", "Me haces descuento si llevo 3?"],
    espera: { escalar: "descuento" },
  },
  { nombre: "pide-humano", mensajes: ["Quiero hablar con una persona"], espera: { escalar: "pide_humano" } },
  {
    nombre: "compra-completa",
    mensajes: [
      "Quiero un archivero de 4 gavetas",
      "Solo 1, para Guadalupe",
      "Sí, quiero avanzar",
      "Soy Laura Pérez, Calle Hidalgo 120, Col. Centro, Guadalupe. Recibo de 10 a 2, sin factura, pago por transferencia",
    ],
    espera: { escalar: "listo_para_comprar" },
  },
  {
    nombre: "fuera-de-zona",
    mensajes: ["Hacen envíos a Reynosa? Quiero 2 sillas"],
    espera: { escalar: "fuera_de_zona" },
  },
  { nombre: "eres-bot", mensajes: ["Eres un bot?"], espera: { sinEscalar: true, textoIncluye: "asistente" } },
  {
    nombre: "domingo-noche",
    inicio: [2026, 9, 11, 22],
    mensajes: ["Hola, tienen escritorios para entrega inmediata?"],
    espera: { sinEscalar: true },
  },
  {
    // Regla 15: «ERGO» coincide con la Silla ERGO ($3,100) y la Silla ERGO operativa ($1,950).
    nombre: "silla-ergo",
    mensajes: ["Hola, cuánto cuesta la silla ergo?"],
    espera: { herramientas: ["buscar_productos"], incluyeTodos: ["3,100", "1,950"], sinEscalar: true },
  },
  {
    nombre: "bryan-entra",
    mensajes: [
      "Hola, precio de la silla LITE",
      { bryan: "Hola, soy Bryan. Yo te atiendo, ¿para cuántas personas son?" },
      "Para 3, gracias",
    ],
    espera: { callaTrasBryan: true },
  },
];
