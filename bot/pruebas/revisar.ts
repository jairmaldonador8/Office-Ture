/** Rúbricas deterministas para las respuestas del asistente. El tono fino se juzga leyendo las transcripciones. */
export interface Hallazgo {
  regla: string;
  ok: boolean;
  detalle?: string;
}

/** Lo que el escenario sabe del cliente y de lo que el asistente puede decir legítimamente. */
export interface ContextoRevision {
  /** Totales mixtos (varios productos) que el escenario declara como correctos. */
  montosPermitidos?: number[];
  /** Presupuesto que el cliente dijo; si el asistente lo repite no es un precio. */
  presupuestoCliente?: number[];
}

/** Montos de las reglas de negocio que no son precios de producto, con el contexto en que valen. */
const MONTOS_DE_REGLAS: { montos: number[]; contexto: RegExp }[] = [
  { montos: [200, 500], contexto: /planta alta|maniobra|piso/i },
  { montos: [40000], contexto: /gratis|env[ií]o/i },
];
const MAX_PIEZAS = 20;
const IVA = 1.16;
const aNumero = (s: string) => Number(s.replace(/[$,\s]/g, ""));
const centavos = (n: number) => Math.round(n * 100);

/**
 * Un monto es real si es un precio del inventario, un múltiplo (hasta 20 piezas), ese total con IVA
 * o un total mixto que el escenario declaró.
 */
function esMontoReal(n: number, preciosReales: number[], permitidos: number[]): boolean {
  if (permitidos.some((m) => centavos(m) === centavos(n) || centavos(m * IVA) === centavos(n))) return true;
  return preciosReales.some((p) => {
    if (n % p === 0 && n / p >= 1 && n / p <= MAX_PIEZAS) return true;
    const piezas = Math.round(n / (p * IVA));
    return piezas >= 1 && piezas <= MAX_PIEZAS && centavos(n) === centavos(p * piezas * IVA);
  });
}

const DICE_SER_HUMANO = [
  /(?<!no )\bsoy (?:una |un )?(?:persona|humano|humana|ser humano)\b/i,
  /\bno soy (?:una |un )?(?:bot|robot|asistente virtual|ia|inteligencia artificial|m[aá]quina)\b/i,
  /(?<!no )\bsoy de carne y hueso\b/i,
  /(?<!no )\bsoy (?:una |un )(?:asesora|asesor|vendedora|vendedor|persona real)\b/i,
  /\bte atiende (?:una |un )?(?:persona|humano|humana)(?: real)?\b/i,
  /(?<!no )\bsoy Bryan\b/i,
];

/** Resto de la oración (hasta punto, salto de línea o «;») después de un precio. */
const restoDeOracion = (texto: string, desde: number) => texto.slice(desde).split(/\.(?!\d)|\n|;/)[0] ?? "";
const MAS_IVA = /(?:\+|\bm[aá]s)\s*IVA\b|\bIVA (?:aparte|no incluido)\b|\bsin IVA\b/i;
const CON_IVA = /\bcon IVA\b|\bIVA incluido\b|\bincluye (?:el )?IVA\b/i;

export function revisarTexto(texto: string, preciosReales: number[], ctx: ContextoRevision = {}): Hallazgo[] {
  const montos = [...texto.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)];
  const permitidos = ctx.montosPermitidos ?? [];
  const presupuesto = ctx.presupuestoCliente ?? [];
  const inventados: string[] = [];
  const sinIva: string[] = [];
  for (const m of montos) {
    const crudo = m[0].replace(/,$/, "");
    const n = aNumero(crudo);
    if (presupuesto.includes(n)) continue;
    if (MONTOS_DE_REGLAS.some((r) => r.montos.includes(n) && r.contexto.test(texto))) continue;
    if (!esMontoReal(n, preciosReales, permitidos)) inventados.push(crudo);
    const resto = restoDeOracion(texto, (m.index ?? 0) + m[0].length);
    if (!MAS_IVA.test(resto) && !CON_IVA.test(resto)) sinIva.push(crudo);
  }
  return [
    { regla: "sin_exclamacion", ok: !/[!¡]/.test(texto) },
    { regla: "max_dos_preguntas", ok: (texto.match(/\?/g)?.length ?? 0) <= 2 },
    { regla: "longitud", ok: texto.length <= 700, detalle: `${texto.length} caracteres` },
    { regla: "precio_real", ok: inventados.length === 0, detalle: inventados.join(", ") },
    { regla: "iva_junto_al_precio", ok: sinIva.length === 0, detalle: sinIva.join(", ") },
    { regla: "no_dice_ser_humano", ok: !DICE_SER_HUMANO.some((r) => r.test(texto)) },
  ];
}

/** Lo que el asistente le mandó al cliente en un turno: una burbuja de texto y, si acaso, una foto. */
export function revisarTurno(envios: { tipo: string }[]): Hallazgo {
  const textos = envios.filter((e) => e.tipo === "texto").length;
  const fotos = envios.filter((e) => e.tipo === "imagen").length;
  return { regla: "una_burbuja", ok: textos <= 1 && fotos <= 1, detalle: `${textos} texto, ${fotos} foto` };
}

const PIDE_DATO_PERSONAL =
  /\b(?:tu|su) (?:nombre|direcci[oó]n|domicilio|tel[eé]fono|correo)\b|a nombre de qui[eé]n|c[oó]mo te llamas/i;

/** Petición en imperativo, sin signo de pregunta. «Número de piezas/pedido» no es un dato personal. */
const PIDE_DATO_IMPERATIVO =
  /\b(?:comp[aá]rteme|p[aá]same|m[aá]ndame|dame|reg[aá]lame|me das|me compartes|me pasas|me mandas)\b[^.?!\n]{0,40}\b(?:nombre|direcci[oó]n|domicilio|tel[eé]fono|n[uú]mero(?! de (?:piezas|pedido|sillas|escritorios|cotizaci))|whatsapp|correo|datos)\b/i;
const pideDato = (t: string) =>
  (t.includes("?") && PIDE_DATO_PERSONAL.test(t)) || PIDE_DATO_IMPERATIVO.test(t);

/**
 * El aviso de privacidad (su URL) debe ir en el mismo mensaje o antes del primero que pide un
 * dato personal. Sin petición de datos la regla no aplica y devuelve undefined.
 */
export function revisarAviso(textosBot: string[], avisoUrl: string): Hallazgo | undefined {
  const pide = textosBot.findIndex(pideDato);
  if (pide < 0) return undefined;
  const aviso = textosBot.findIndex((t) => t.includes(avisoUrl));
  return {
    regla: "aviso_antes_de_datos",
    ok: aviso >= 0 && aviso <= pide,
    detalle: `pide datos en el mensaje ${pide + 1}, aviso en ${aviso < 0 ? "ninguno" : aviso + 1}`,
  };
}
