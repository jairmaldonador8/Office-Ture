import { waitUntil } from "@vercel/functions";
import { dependencias } from "../../src/dependencias.js";
import { manejarWebhook, verificarSuscripcion } from "../../src/flujo/webhook.js";

/** Verificación de la suscripción del webhook en el panel de Meta. */
export function GET(req: Request): Response {
  return verificarSuscripcion(req, dependencias().config.META_VERIFY_TOKEN);
}

/** Eventos de Instagram: responde 200 en cuanto quedan guardados y los procesa con waitUntil. */
export function POST(req: Request): Promise<Response> {
  return manejarWebhook(req, "instagram", dependencias(), waitUntil);
}
