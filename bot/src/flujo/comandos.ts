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

function separarRef(resto: string): { ref?: string; libre: string } {
  const [primera = "", ...demas] = resto.split(/\s+/);
  if (primera.startsWith("@")) return { ref: primera, libre: demas.join(" ") };
  // Un teléfono puede venir con espacios: toma los dígitos iniciales.
  const m = resto.match(/^([\d\s+-]{10,})(.*)$/);
  if (m) {
    const digitos = (m[1] ?? "").replace(/\D/g, "");
    if (digitos.length >= 10) return { ref: digitos.slice(-10), libre: (m[2] ?? "").trim() };
  }
  return { libre: resto };
}

export function parsearComando(texto: string): Comando | null {
  const t = texto.trim();
  if (!t.startsWith("/")) return null;
  const [cabeza = "", ...cola] = t.slice(1).split(/\s+/);
  const nombre = cabeza.toLowerCase();
  const { ref, libre } = separarRef(cola.join(" ").trim());
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
