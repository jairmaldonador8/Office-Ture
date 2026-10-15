export type Comando =
  | { tipo: "bot" | "pausa" | "ganado"; ref?: string }
  | { tipo: "perdido"; ref?: string; motivo?: string }
  | { tipo: "ayuda" }
  | { tipo: "desconocido" };

export const AYUDA_COMANDOS = [
  "Comandos (mándalos a este número desde tu WhatsApp personal, o respondiendo a la alerta):",
  "/bot 8112345678  el asistente vuelve a atender ese chat",
  "/pausa 8112345678  el asistente se calla en ese chat hasta /bot",
  "/ganado 8112345678  venta cerrada",
  "/perdido 8112345678 motivo  venta perdida",
  "En Instagram usa el usuario: /bot @usuario",
].join("\n");

// Umbral para considerar que un primer token "parece teléfono": con 7 dígitos o más
// es un intento de número (y debe ser válido); con menos (p. ej. "3000") es texto libre.
// Solo aplica a /perdido, que admite motivo libre; /bot, /pausa y /ganado no tienen
// texto libre, así que ahí cualquier número es un intento de teléfono (/bot 81123).
const DIGITOS_DE_TELEFONO = 7;

/** Normaliza a 10 dígitos MX (quita 52/521); null si no es válido. */
function normalizarTelefono(digitos: string): string | null {
  if (digitos.length === 10) return digitos;
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos.slice(2);
  if (digitos.length === 13 && digitos.startsWith("521")) return digitos.slice(3);
  return null;
}

type Separado = { ref?: string; libre: string; malformado?: true };

function separarRef(resto: string, hayTextoLibre: boolean): Separado {
  const [primera = "", ...demas] = resto.split(/\s+/);
  if (primera.startsWith("@")) return { ref: primera, libre: demas.join(" ") };
  if (!/^[+\d]/.test(primera)) return { libre: resto };
  // Un teléfono puede venir en varios tokens ("81 1234 5678"): junta los tokens
  // numéricos iniciales y toma el prefijo más corto que sea un número válido.
  const tokens = resto.split(/\s+/);
  let n = 0;
  while (n < tokens.length && /^[\d+-]+$/.test(tokens[n] ?? "")) n++;
  for (let k = 1; k <= n; k++) {
    const ref = normalizarTelefono(tokens.slice(0, k).join("").replace(/\D/g, ""));
    if (ref) return { ref, libre: tokens.slice(k).join(" ") };
  }
  const total = tokens.slice(0, n).join("").replace(/\D/g, "").length;
  if (total >= (hayTextoLibre ? DIGITOS_DE_TELEFONO : 1)) return { libre: resto, malformado: true };
  return { libre: resto };
}

export function parsearComando(texto: string): Comando | null {
  // Quita el formato de WhatsApp (*negrita*, _cursiva_, ~tachado~) alrededor del mensaje.
  const t = texto.replace(/^[\s*_~]+|[\s*_~]+$/g, "");
  if (!t.startsWith("/")) return null;
  const [cabeza = "", ...cola] = t.slice(1).split(/\s+/);
  const nombre = cabeza.toLowerCase();
  const { ref, libre, malformado } = separarRef(cola.join(" ").trim(), nombre === "perdido");
  // Un teléfono mal escrito no debe caer en "la alerta citada": se rechaza.
  if (malformado && ["bot", "pausa", "ganado", "perdido"].includes(nombre)) return { tipo: "desconocido" };
  const conRef = <T extends object>(o: T) => (ref ? { ...o, ref } : o);
  switch (nombre) {
    case "bot":
    case "pausa":
    case "ganado":
      return conRef({ tipo: nombre });
    case "perdido":
      return conRef(libre ? { tipo: "perdido" as const, motivo: libre } : { tipo: "perdido" as const });
    case "ayuda":
      return { tipo: "ayuda" };
    default:
      return { tipo: "desconocido" };
  }
}
