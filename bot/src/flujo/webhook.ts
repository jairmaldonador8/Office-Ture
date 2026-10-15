import { createHash, timingSafeEqual } from "node:crypto";
import { firmaValida } from "../canales/firma.js";
import { parsearInstagram } from "../canales/instagram.js";
import { type Canal, type EventoCanal, idEvento } from "../canales/tipos.js";
import { parsearWhatsApp } from "../canales/whatsapp.js";
import { errorSeguro } from "../log.js";
import type { Deps } from "./deps.js";
import { procesarLote } from "./entrada.js";

/** Compara en tiempo constante; los resúmenes SHA-256 igualan longitudes. */
function iguales(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** GET de Meta al suscribir el webhook: devuelve `hub.challenge` si el token coincide. */
export function verificarSuscripcion(req: Request, token: string): Response {
  const u = new URL(req.url);
  const recibido = u.searchParams.get("hub.verify_token");
  if (u.searchParams.get("hub.mode") === "subscribe" && recibido !== null && iguales(recibido, token)) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("forbidden", { status: 403 });
}

/** `Authorization: Bearer <secreto>`, como lo mandan los crons de Vercel y pg_cron. */
export function autorizado(req: Request, secreto: string): boolean {
  const h = req.headers.get("authorization");
  if (!secreto || !h) return false;
  return iguales(h, `Bearer ${secreto}`);
}

/**
 * POST de Meta: valida la firma sobre el cuerpo crudo, guarda cada evento nuevo
 * (el id externo deduplica los reintentos de Meta), responde de inmediato y deja el
 * procesamiento en `diferir` (waitUntil en Vercel). Lo que no termine lo retoma el cron.
 */
export async function manejarWebhook(
  req: Request,
  canal: Canal,
  d: Deps,
  diferir: (p: Promise<unknown>) => void,
): Promise<Response> {
  const crudo = await req.text();
  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"), d.config.META_APP_SECRET)) {
    return new Response("firma inválida", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(crudo);
  } catch {
    // Firmado por Meta pero ilegible: un reintento no lo arreglaría.
    console.error("webhook", canal, "cuerpo que no es JSON");
    return new Response("ok");
  }
  const eventos =
    canal === "whatsapp" ? parsearWhatsApp(payload) : parsearInstagram(payload, d.config.IG_USER_ID);
  const nuevos: EventoCanal[] = [];
  // Si la base falla aquí, el 500 hace que Meta reintente: mejor que perder el mensaje.
  for (const ev of eventos) if (await d.repo.registrarEvento(idEvento(ev), canal, ev)) nuevos.push(ev);
  if (nuevos.length > 0) {
    diferir(procesarLote(nuevos, d).catch((e: unknown) => console.error("lote", canal, errorSeguro(e))));
  }
  return new Response("ok");
}
