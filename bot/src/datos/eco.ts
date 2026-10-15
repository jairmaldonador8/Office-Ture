import { recortarBytes } from "../canales/instagram.js";
import type { Mensaje } from "./tipos.js";

/** Lo que trae el eco para reconocer un envío propio cuyo id aún no se guarda. */
export interface HuellaEco {
  texto?: string;
  esImagen: boolean;
}

const normal = (t: string): string => t.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * ¿Esta fila pendiente del bot es la que produjo el eco? Instagram recorta el texto
 * a 1000 bytes al enviarlo, así que el eco puede traer la versión recortada.
 */
function coincide(m: Mensaje, h: HuellaEco): boolean {
  if (h.esImagen) return m.tipo === "imagen";
  if (m.tipo === "imagen" || !m.texto || !h.texto) return false;
  const eco = normal(h.texto);
  return normal(m.texto) === eco || normal(recortarBytes(m.texto, 1000)) === eco;
}

/**
 * Elige entre filas pendientes del bot (sin id externo) la más reciente que coincide.
 * Para imágenes prefiere la que tiene el mismo pie; si el eco no trae pie, la más reciente.
 */
export function elegirPendiente(pendientes: Mensaje[], h: HuellaEco): Mensaje | null {
  const orden = [...pendientes].sort((a, b) => b.creado.getTime() - a.creado.getTime());
  const candidatas = orden.filter((m) => coincide(m, h));
  if (h.esImagen && h.texto) {
    const eco = normal(h.texto);
    const conPie = candidatas.find((m) => m.texto && normal(m.texto) === eco);
    if (conPie) return conPie;
  }
  return candidatas[0] ?? null;
}
