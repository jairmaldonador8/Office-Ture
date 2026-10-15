import type { Canal, Enviador } from "../canales/tipos.js";
import type { Transcriptor } from "../canales/transcribir.js";
import type { ModeloCliente } from "../cerebro/responder.js";
import type { Config } from "../config.js";
import type { Almacen, Repo } from "../datos/tipos.js";

/** Dependencias inyectables del flujo: las reales salen de `dependencias.ts`, las de prueba de `apoyo.ts`. */
export interface Deps {
  config: Config;
  repo: Repo;
  almacen: Almacen;
  enviadores: Record<Canal, Enviador>;
  modelo: ModeloCliente;
  perfilInstagram?: (igsid: string) => Promise<{ nombre?: string; usuario?: string }>;
  transcribir?: Transcriptor;
  correo?: (asunto: string, texto: string) => Promise<void>;
  ahora: () => Date;
  esperar: (ms: number) => Promise<void>;
}
