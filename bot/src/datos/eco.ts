import { recortarBytes } from "../canales/instagram.js";
import type { Mensaje } from "./tipos.js";

/** Lo que trae el eco para reconocer un envío propio cuyo id aún no se guarda. */
export interface HuellaEco {
  texto?: string;
  esImagen: boolean;
}

/**
 * El eco de un envío del bot se había guardado como mensaje de Bryan y se acaba de borrar.
 * Ese eco ya pudo pasar la conversación a modo humano; no se revierte solo, se avisa.
 */
export function avisarEcoBorrado(conversacionId: string): void {
  console.warn(
    "eco del bot guardado como mensaje de Bryan: la conversación pudo pausarse por error",
    conversacionId,
  );
}

const normal = (t: string): string => t.normalize("NFC").replace(/\s+/g, " ").trim();

/** Mismo texto, también si el eco trae la versión recortada a 1000 bytes que manda Instagram. */
function mismoTexto(guardado: string, eco: string): boolean {
  const e = normal(eco);
  return normal(guardado) === e || normal(recortarBytes(guardado, 1000)) === e;
}

/**
 * ¿Esta fila pendiente del bot es la que produjo el eco? Un texto debe coincidir. Una imagen
 * coincide con cualquier imagen pendiente, salvo que ambas traigan pie: entonces el pie debe
 * ser el mismo.
 */
function coincide(m: Mensaje, h: HuellaEco): boolean {
  if (h.esImagen) return m.tipo === "imagen" && (!m.texto || !h.texto || mismoTexto(m.texto, h.texto));
  if (m.tipo === "imagen" || !m.texto || !h.texto) return false;
  return mismoTexto(m.texto, h.texto);
}

/**
 * Elige entre filas pendientes del bot (sin id externo) la que produjo el eco. Si varias
 * coinciden toma la más antigua: los ecos llegan en el mismo orden que los envíos.
 */
export function elegirPendiente(pendientes: Mensaje[], h: HuellaEco): Mensaje | null {
  const orden = [...pendientes].sort((a, b) => a.creado.getTime() - b.creado.getTime());
  return orden.find((m) => coincide(m, h)) ?? null;
}
