/** Rúbricas deterministas para las respuestas del asistente. El tono fino se juzga leyendo las transcripciones. */
export interface Hallazgo {
  regla: string;
  ok: boolean;
  detalle?: string;
}

/** Montos de las reglas de negocio (planta alta, tope de pedido) que no son precios de producto. */
const MONTOS_DE_REGLAS = new Set([200, 500, 40000]);
const MAX_PIEZAS = 100;
const IVA = 1.16;
const aNumero = (s: string) => Number(s.replace(/[$,\s]/g, ""));
const centavos = (n: number) => Math.round(n * 100);

/** Un monto es real si es un precio del inventario, un múltiplo (total por piezas) o ese total con IVA. */
function esMontoReal(n: number, preciosReales: number[]): boolean {
  return preciosReales.some((p) => {
    if (n % p === 0 && n / p >= 1 && n / p <= MAX_PIEZAS) return true;
    const piezas = Math.round(n / (p * IVA));
    return piezas >= 1 && piezas <= MAX_PIEZAS && centavos(n) === centavos(p * piezas * IVA);
  });
}

const DICE_SER_HUMANO = [
  /(?<!no )\bsoy (?:una |un )?(?:persona|humano|humana|ser humano)\b/i,
  /\bno soy (?:una |un )?(?:bot|robot|asistente virtual|ia|inteligencia artificial|m[aá]quina)\b/i,
];

export function revisarTexto(texto: string, preciosReales: number[]): Hallazgo[] {
  const montos = [...texto.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)];
  const inventados: string[] = [];
  const sinIva: string[] = [];
  for (const m of montos) {
    const crudo = m[0].replace(/,$/, "");
    const n = aNumero(crudo);
    if (MONTOS_DE_REGLAS.has(n)) continue;
    if (!esMontoReal(n, preciosReales)) inventados.push(crudo);
    const fin = (m.index ?? 0) + m[0].length;
    if (!/IVA/.test(texto.slice(fin, fin + 20))) sinIva.push(crudo);
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

/**
 * El aviso de privacidad (su URL) debe ir en el mismo mensaje o antes del primero que pide un
 * dato personal. Sin petición de datos la regla no aplica y devuelve undefined.
 */
export function revisarAviso(textosBot: string[], avisoUrl: string): Hallazgo | undefined {
  const pide = textosBot.findIndex((t) => t.includes("?") && PIDE_DATO_PERSONAL.test(t));
  if (pide < 0) return undefined;
  const aviso = textosBot.findIndex((t) => t.includes(avisoUrl));
  return {
    regla: "aviso_antes_de_datos",
    ok: aviso >= 0 && aviso <= pide,
    detalle: `pide datos en el mensaje ${pide + 1}, aviso en ${aviso < 0 ? "ninguno" : aviso + 1}`,
  };
}
