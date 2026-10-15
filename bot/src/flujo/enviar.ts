import { ErrorMeta } from "../canales/tipos.js";
import type { Contacto, Conversacion } from "../datos/tipos.js";
import type { Deps } from "./deps.js";

export type ContenidoEnvio = { tipo: "texto"; texto: string } | { tipo: "imagen"; url: string; pie?: string };

export interface OpcionesEnvio {
  /**
   * Intentos de envío (espera 1 s, 2 s, ... entre ellos). Por omisión, 1. Con más de uno el
   * cliente puede recibir el mensaje dos veces: si un intento se agota pero sí salió, el
   * siguiente lo repite (la Send API de Meta no tiene clave de idempotencia).
   */
  intentos?: number;
}

/**
 * Meta respondió con un error de cliente: el mensaje seguro no salió y reintentar no sirve.
 * El 429 (límite de envíos) no cuenta: se reintenta y su resultado se trata como dudoso.
 */
const rechazoSeguro = (e: unknown): boolean => e instanceof ErrorMeta && e.status < 500 && e.status !== 429;

/**
 * Manda un mensaje del bot al cliente. La fila se guarda ANTES de enviar (sin id externo,
 * o sea pendiente) para que el eco del propio envío se reconozca aunque llegue antes de
 * que Meta devuelva el id. Al salir, la fila recibe el id. Si Meta lo rechaza, la fila se
 * borra; si no se sabe si salió (red, tiempo agotado, 429), se conserva para reconocer un
 * eco tardío. En ambos casos el error se relanza. Si un intento quedó en duda y otro
 * posterior sale, ese guarda su propia fila con su id y la original sigue pendiente para
 * el eco del primero. Devuelve el id externo del envío.
 *
 * Ojo: con `intentos > 1` el cliente puede recibir el mensaje dos veces (ver `OpcionesEnvio`).
 */
export async function enviarAlCliente(
  d: Deps,
  conv: Pick<Conversacion, "id" | "hilo" | "canal">,
  contacto: Pick<Contacto, "idExterno">,
  contenido: ContenidoEnvio,
  opciones: OpcionesEnvio = {},
): Promise<string> {
  const texto = contenido.tipo === "texto" ? contenido.texto : contenido.pie;
  const nuevo = {
    conversacionId: conv.id,
    hilo: conv.hilo,
    autor: "bot",
    tipo: contenido.tipo,
    ...(texto ? { texto } : {}),
  } as const;
  const fila = await d.repo.guardarMensaje(nuevo);
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
    if (!id) return id;
    if (dudoso)
      // Un intento anterior pudo haber salido también: su eco necesita la fila pendiente.
      await d.repo
        .guardarMensaje({ ...nuevo, idExterno: id })
        .catch((e: unknown) => console.error("guardar reintento", fila.id, e));
    else
      await d.repo
        .asignarIdExterno(fila.id, id)
        .catch((e: unknown) => console.error("asignar id", fila.id, e));
    return id;
  }
}
