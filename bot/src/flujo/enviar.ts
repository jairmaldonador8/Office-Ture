import { ErrorMeta } from "../canales/tipos.js";
import type { Contacto, Conversacion } from "../datos/tipos.js";
import type { Deps } from "./deps.js";

export type ContenidoEnvio = { tipo: "texto"; texto: string } | { tipo: "imagen"; url: string; pie?: string };

export interface OpcionesEnvio {
  /** Intentos de envío sobre la misma fila (espera 1 s, 2 s, ... entre ellos). Por omisión, 1. */
  intentos?: number;
}

/** Meta respondió con un error de cliente: el mensaje seguro no salió y reintentar no sirve. */
const rechazoSeguro = (e: unknown): boolean => e instanceof ErrorMeta && e.status < 500;

/**
 * Manda un mensaje del bot al cliente. La fila se guarda ANTES de enviar (sin id externo,
 * o sea pendiente) para que el eco del propio envío se reconozca aunque llegue antes de
 * que Meta devuelva el id. Al salir, la fila recibe el id. Si Meta lo rechaza, la fila se
 * borra; si no se sabe si salió (red, tiempo agotado), se conserva para reconocer un eco
 * tardío. En ambos casos el error se relanza. Devuelve el id externo del envío.
 */
export async function enviarAlCliente(
  d: Deps,
  conv: Pick<Conversacion, "id" | "hilo" | "canal">,
  contacto: Pick<Contacto, "idExterno">,
  contenido: ContenidoEnvio,
  opciones: OpcionesEnvio = {},
): Promise<string> {
  const texto = contenido.tipo === "texto" ? contenido.texto : contenido.pie;
  const fila = await d.repo.guardarMensaje({
    conversacionId: conv.id,
    hilo: conv.hilo,
    autor: "bot",
    tipo: contenido.tipo,
    ...(texto ? { texto } : {}),
  });
  const enviador = d.enviadores[conv.canal];
  const intentos = Math.max(1, opciones.intentos ?? 1);
  let dudoso = false;
  for (let i = 0; ; i++) {
    let id: string;
    try {
      id =
        contenido.tipo === "texto"
          ? await enviador.texto(contacto.idExterno, contenido.texto)
          : await enviador.imagen(contacto.idExterno, contenido.url, contenido.pie);
    } catch (e) {
      if (rechazoSeguro(e)) {
        // Si un intento anterior quedó en duda pudo haber salido: la fila se conserva.
        if (!dudoso) await d.repo.borrarMensaje(fila.id);
        throw e;
      }
      dudoso = true;
      if (i >= intentos - 1) throw e;
      await d.esperar(1000 * 2 ** i);
      continue;
    }
    // Ya salió: si guardar el id falla no se reintenta el envío; la fila pendiente
    // sigue sirviendo para reconocer el eco durante unos minutos.
    if (id)
      await d.repo
        .asignarIdExterno(fila.id, id)
        .catch((e: unknown) => console.error("asignar id", fila.id, e));
    return id;
  }
}
