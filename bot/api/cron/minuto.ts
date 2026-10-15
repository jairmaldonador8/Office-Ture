import { dependencias } from "../../src/dependencias.js";
import { ejecutarMinuto } from "../../src/flujo/cron.js";
import { autorizado } from "../../src/flujo/webhook.js";

/** Cron de Vercel cada minuto (manda `Authorization: Bearer $CRON_SECRET`). */
export async function GET(req: Request): Promise<Response> {
  const d = dependencias();
  if (!autorizado(req, d.config.CRON_SECRET)) return new Response("no autorizado", { status: 401 });
  return Response.json(await ejecutarMinuto(d));
}
