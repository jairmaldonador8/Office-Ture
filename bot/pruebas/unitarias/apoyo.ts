import type Anthropic from "@anthropic-ai/sdk";
import type { Enviador, EventoCanal, MediaDescargada, MensajeEntrante } from "../../src/canales/tipos.js";
import type { ModeloCliente } from "../../src/cerebro/responder.js";
import { cargarConfig } from "../../src/config.js";
import { AlmacenMemoria, RepoMemoria } from "../../src/datos/memoria.js";
import type { Deps } from "../../src/flujo/deps.js";

export const envBase = {
  META_APP_SECRET: "secreto",
  META_VERIFY_TOKEN: "verifica",
  WA_PHONE_NUMBER_ID: "123",
  WA_TOKEN: "tok",
  IG_USER_ID: "IGNEGOCIO",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  ANTHROPIC_API_KEY: "sk-ant",
  DUENOS: "Bryan:5218111111111,Socio:5218122222222",
  AVISO_PRIVACIDAD_URL: "https://officeture.mx/privacidad",
  CRON_SECRET: "0123456789abcdef",
};

export interface Enviado {
  tipo: "texto" | "imagen" | "plantilla" | "escribiendo";
  para: string;
  texto?: string;
  url?: string;
  plantilla?: string;
  variables?: string[];
}

export class EnviadorFalso implements Enviador {
  enviados: Enviado[] = [];
  falla = false;
  private n = 0;
  private registrar(e: Enviado) {
    if (this.falla && e.tipo !== "escribiendo") throw new Error("fallo de envío simulado");
    this.enviados.push(e);
    return `out.${++this.n}`;
  }
  async texto(para: string, texto: string) {
    return this.registrar({ tipo: "texto", para, texto });
  }
  async imagen(para: string, url: string, pie?: string) {
    return this.registrar({ tipo: "imagen", para, url, ...(pie ? { texto: pie } : {}) });
  }
  async escribiendo(para: string) {
    this.enviados.push({ tipo: "escribiendo", para });
  }
  async plantilla(para: string, plantilla: string, variables: string[]) {
    return this.registrar({ tipo: "plantilla", para, plantilla, variables });
  }
  async descargarMedia(): Promise<MediaDescargada> {
    return { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" };
  }
  textos(para?: string) {
    return this.enviados
      .filter((e) => e.tipo === "texto" && (!para || e.para === para))
      .map((e) => e.texto ?? "");
  }
}

/** Modelo falso: cada llamada consume la siguiente respuesta guionada. */
export function modeloGuionado(
  respuestas: (Partial<Anthropic.Message> | Error)[],
): ModeloCliente & { llamadas: number } {
  const m = {
    llamadas: 0,
    async crear() {
      m.llamadas++;
      const r = respuestas.shift();
      if (!r) throw new Error("sin respuesta guionada");
      if (r instanceof Error) throw r;
      return {
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: "end_turn",
        content: [],
        ...r,
      } as Anthropic.Message;
    },
  };
  return m;
}

export const respuestaTexto = (text: string): Partial<Anthropic.Message> => ({
  stop_reason: "end_turn",
  content: [{ type: "text", text, citations: null }] as Anthropic.ContentBlock[],
});
export const llamadaHerramienta = (name: string, input: object, id = "t1"): Partial<Anthropic.Message> => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }] as Anthropic.ContentBlock[],
});

/** Viernes 9 de octubre de 2026, 10:00 en Monterrey. */
export const INICIO = new Date("2026-10-09T16:00:00Z");

export function depsDePrueba(o: Partial<Deps> = {}) {
  const repo = new RepoMemoria();
  let t = INICIO;
  repo.reloj = () => t;
  const wa = new EnviadorFalso();
  const ig = new EnviadorFalso();
  const deps: Deps = {
    config: cargarConfig(envBase),
    repo,
    almacen: new AlmacenMemoria(),
    enviadores: { whatsapp: wa, instagram: ig },
    modelo: modeloGuionado([]),
    ahora: () => t,
    esperar: async () => {},
    ...o,
  };
  const reloj = {
    fijar: (d: Date) => {
      t = d;
    },
    avanzar: (ms: number) => {
      t = new Date(t.getTime() + ms);
    },
  };
  return { deps, repo, wa, ig, reloj };
}

let consecutivo = 0;
export function mensajeWa(texto: string, extra: Partial<MensajeEntrante> = {}): EventoCanal {
  return {
    clase: "mensaje",
    m: {
      canal: "whatsapp",
      idExterno: `wamid.${++consecutivo}`,
      de: "5218112345678",
      nombre: "Laura",
      tipo: "texto",
      texto,
      fecha: INICIO.toISOString(),
      ...extra,
    },
  };
}
