import { createHmac, timingSafeEqual } from "node:crypto";

/** Valida X-Hub-Signature-256 sobre el cuerpo CRUDO (nunca sobre JSON re-serializado). */
export function firmaValida(cuerpoCrudo: string, encabezado: string | null, secreto: string): boolean {
  if (!encabezado?.startsWith("sha256=")) return false;
  const recibido = Buffer.from(encabezado.slice(7), "utf8");
  const esperado = Buffer.from(
    createHmac("sha256", secreto).update(cuerpoCrudo, "utf8").digest("hex"),
    "utf8",
  );
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}
