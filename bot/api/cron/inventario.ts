import { lectorHoja } from "../../src/canales/hoja-google.js";
import { dependencias } from "../../src/dependencias.js";
import { sincronizarInventario } from "../../src/flujo/inventario.js";
import { autorizado } from "../../src/flujo/webhook.js";

let leer: (() => Promise<string[][]>) | undefined;

/** Cron de Vercel cada 10 minutos: copia la hoja de Google a la tabla de productos. */
export async function GET(req: Request): Promise<Response> {
  const d = dependencias();
  if (!autorizado(req, d.config.CRON_SECRET)) return new Response("no autorizado", { status: 401 });
  const c = d.config;
  leer ??= lectorHoja(c.GOOGLE_SA_JSON, c.HOJA_ID, c.HOJA_PESTANA);
  return Response.json(await sincronizarInventario(d, leer));
}
