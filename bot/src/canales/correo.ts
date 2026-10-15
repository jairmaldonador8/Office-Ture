import { TIEMPO_LIMITE_MS } from "./tipos.js";

/** Copia de alertas por correo con la API de Resend. Lanza si Resend no acepta el envío. */
export function correoResend(apiKey: string, de: string, para: string, f: typeof fetch = fetch) {
  return async (asunto: string, texto: string): Promise<void> => {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: asunto, text: texto }),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
  };
}
