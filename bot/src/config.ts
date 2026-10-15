import { z } from "zod";

const Esquema = z.object({
  META_APP_SECRET: z.string().min(1),
  META_VERIFY_TOKEN: z.string().min(1),
  META_GRAPH_VERSION: z.string().default("v25.0"),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_TOKEN: z.string().min(1),
  IG_USER_ID: z.string().default(""),
  IG_PAGE_TOKEN: z.string().default(""),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5-5"),
  OPENAI_API_KEY: z.string().default(""),
  GOOGLE_SA_JSON: z.string().default(""),
  HOJA_ID: z.string().default("1aUWbdkkDhSSW-AgYewjJkYmT0fpVmn3Vy-z_XLSx0xk"),
  HOJA_PESTANA: z.string().default("Import_GHL"),
  DUENOS: z.string().min(1),
  NOMBRE_ASISTENTE: z.string().default("Mariana"),
  AVISO_PRIVACIDAD_URL: z.string().url(),
  CORREO_ALERTAS: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM: z.string().default(""),
  CRON_SECRET: z.string().min(16),
});

export type Config = z.infer<typeof Esquema>;

export function cargarConfig(env: Record<string, string | undefined> = process.env): Config {
  return Esquema.parse(env);
}

export interface Dueno {
  nombre: string;
  telefono: string;
}

export function duenos(c: Config): Dueno[] {
  return c.DUENOS.split(",")
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [nombre = "", telefono = ""] = par.split(":");
      return { nombre: nombre.trim(), telefono: telefono.trim() };
    })
    .filter((d) => ultimos10(d.telefono) !== "");
}

export const ultimos10 = (numero: string): string => numero.replace(/\D/g, "").slice(-10);

export function esDueno(c: Config, numero: string): boolean {
  const n = ultimos10(numero);
  return duenos(c).some((d) => ultimos10(d.telefono) === n);
}
