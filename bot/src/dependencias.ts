import { createClient } from "@supabase/supabase-js";
import { correoResend } from "./canales/correo.js";
import { ClienteInstagram } from "./canales/instagram.js";
import { transcriptorOpenAI } from "./canales/transcribir.js";
import { ClienteWhatsApp } from "./canales/whatsapp.js";
import { modeloAnthropic } from "./cerebro/responder.js";
import { cargarConfig } from "./config.js";
import { AlmacenSupabase, RepoSupabase } from "./datos/supabase.js";
import type { Deps } from "./flujo/deps.js";

let cache: Deps | undefined;

/**
 * Dependencias reales, armadas una vez por instancia de la función (Fluid Compute
 * reutiliza la instancia entre invocaciones). Lanza si falta una variable obligatoria.
 */
export function dependencias(): Deps {
  if (cache) return cache;
  const config = cargarConfig();
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ig = new ClienteInstagram({ pageToken: config.IG_PAGE_TOKEN, version: config.META_GRAPH_VERSION });
  cache = {
    config,
    repo: new RepoSupabase(db),
    almacen: new AlmacenSupabase(db),
    enviadores: {
      whatsapp: new ClienteWhatsApp({
        phoneNumberId: config.WA_PHONE_NUMBER_ID,
        token: config.WA_TOKEN,
        version: config.META_GRAPH_VERSION,
      }),
      instagram: ig,
    },
    ...(config.IG_PAGE_TOKEN ? { perfilInstagram: (id: string) => ig.perfil(id) } : {}),
    modelo: modeloAnthropic(config.ANTHROPIC_API_KEY),
    ...(config.OPENAI_API_KEY ? { transcribir: transcriptorOpenAI(config.OPENAI_API_KEY) } : {}),
    ...(config.RESEND_API_KEY && config.RESEND_FROM && config.CORREO_ALERTAS
      ? { correo: correoResend(config.RESEND_API_KEY, config.RESEND_FROM, config.CORREO_ALERTAS) }
      : {}),
    ahora: () => new Date(),
    esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return cache;
}
