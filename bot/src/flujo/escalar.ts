import { ultimos10 } from "../config.js";
import type { Contacto } from "../datos/tipos.js";

/** Cómo se identifica al cliente en alertas y comandos: 10 dígitos en WhatsApp, @usuario en Instagram. */
export function referenciaCliente(c: Contacto): string {
  if (c.canal === "whatsapp") return ultimos10(c.telefono ?? c.idExterno);
  return c.usuario ? `@${c.usuario}` : c.idExterno;
}
