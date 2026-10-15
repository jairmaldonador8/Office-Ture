import { waitUntil } from "@vercel/functions";
import { dependencias } from "../src/dependencias.js";
import { despacharTurnos } from "../src/flujo/cron.js";
import { autorizado } from "../src/flujo/webhook.js";

/** Lo llama pg_cron cada 5 segundos: responde 202 de inmediato y procesa los turnos vencidos con waitUntil. */
export function POST(req: Request): Response {
  const d = dependencias();
  if (!autorizado(req, d.config.CRON_SECRET)) return new Response("no autorizado", { status: 401 });
  waitUntil(despacharTurnos(d).catch((e: unknown) => console.error("despachar", e)));
  return new Response("ok", { status: 202 });
}
