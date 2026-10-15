import type { ReferenciaAnuncio } from "../src/canales/tipos.js";

/**
 * Un paso es un mensaje del cliente; con `bryan`, un mensaje que Bryan manda desde su app (eco);
 * con `dueno`, un comando que el dueño manda desde su número personal; con `foto`, una imagen
 * del cliente (el texto es el pie, puede ir vacío).
 */
export type Paso = string | { bryan: string } | { dueno: string } | { foto: string };

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
  /** Tras el comando /bot el asistente vuelve a contestarle al cliente. */
  respondeTrasBot?: boolean;
  /** El mensaje de `incluyeTodos` además pregunta cuál («cuál» o «?»). */
  preguntaCual?: boolean;
}

export interface Escenario {
  nombre: string;
  referencia?: ReferenciaAnuncio;
  /** Hora local de inicio: [año, mes 0-11, día, hora]. Por defecto viernes 9-oct-2026 10:00. */
  inicio?: [number, number, number, number];
  mensajes: Paso[];
  espera: Espera;
  /** Totales mixtos (varios productos) que el asistente puede decir sin que cuenten como inventados. */
  montosPermitidos?: number[];
  /** Montos que el cliente dijo (presupuesto); repetirlos no cuenta como precio. */
  presupuestoCliente?: number[];
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
    presupuestoCliente: [8000],
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
    espera: {
      herramientas: ["buscar_productos"],
      incluyeTodos: ["3,100", "1,950"],
      preguntaCual: true,
      sinEscalar: true,
    },
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
  {
    nombre: "mismo-dia",
    mensajes: ["Necesito 2 escritorios lineales para hoy mismo en Monterrey, ¿me los entregan hoy?"],
    espera: { escalar: "mismo_dia" },
  },
  {
    nombre: "instalacion-especial",
    mensajes: [
      "Quiero 2 archiveros, pero necesito instalación especial: anclarlos a una pared de concreto y pasar cableado por el piso falso",
    ],
    espera: { escalar: "instalacion_especial" },
  },
  {
    nombre: "fuera-de-inventario",
    mensajes: ["Tienen sofás de recepción de 3 plazas en piel? Los quiero en gris"],
    espera: { escalar: "fuera_de_inventario" },
  },
  {
    nombre: "a-medida",
    mensajes: ["Necesito un escritorio hecho a la medida, de 2.40 m en forma de L, con cajonera integrada"],
    espera: { escalar: "a_medida" },
  },
  {
    nombre: "quiere-pagar",
    mensajes: ["Ya me decidí por 1 archivero de 4 gavetas, quiero pagar ya, ¿a qué cuenta te deposito?"],
    espera: { escalar: "quiere_pagar" },
  },
  {
    nombre: "no-entiende",
    mensajes: ["asdf qwer eso de la cosa aquella", "no sé, lo otro con lo de antes, el mismo pero diferente"],
    espera: { escalar: "no_entiende" },
  },
  {
    nombre: "molesto",
    mensajes: ["Llevo dos días esperando respuesta, son unos inútiles, no sirven para nada"],
    espera: { escalar: "molesto" },
  },
  {
    nombre: "proveedor",
    mensajes: ["Buenas tardes, somos fabricantes de melamina y queremos ofrecerles nuestros tableros"],
    espera: { escalar: "proveedor", textoIncluye: "OfiTure@outlook.com" },
  },
  {
    nombre: "planta-alta",
    mensajes: ["Quiero 2 escritorios lineales para una oficina en planta alta, en Monterrey"],
    espera: { marcador: "planta_alta", sinEscalar: true },
  },
  {
    nombre: "foto-espacio",
    mensajes: [{ foto: "Este es mi espacio, ¿qué me recomiendan?" }],
    espera: { sinEscalar: true },
  },
  {
    nombre: "bot-reactiva",
    mensajes: [
      "Hola, precio de la silla LITE",
      { bryan: "Hola, soy Bryan. Yo te atiendo, ¿para cuántas personas son?" },
      { dueno: "/bot 8112345678" },
      "Para 3, gracias",
    ],
    espera: { respondeTrasBot: true },
  },
];
