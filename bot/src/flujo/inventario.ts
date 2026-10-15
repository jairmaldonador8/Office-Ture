import { duenos } from "../config.js";
import { mapearHoja } from "../negocio/hoja.js";
import type { Deps } from "./deps.js";
import { enviarADueno } from "./escalar.js";

export type ResultadoInventario =
  | { activos: number; desactivados: number; errores: string[] }
  | { fallo: string };

/** Fallos seguidos de lectura antes de avisar (el cron corre cada 10 minutos). */
const FALLOS_PARA_AVISAR = 3;
const MAX_LINEAS_AVISO = 15;
const esAviso = (e: string): boolean => e.startsWith("Aviso:");

/** Por correo si está configurado; si no (o si falla), por WhatsApp al dueño principal. Nunca lanza. */
async function avisarDueno(d: Deps, titulo: string, texto: string, detalle: string): Promise<void> {
  if (d.correo) {
    try {
      await d.correo(`OfficeTure · ${titulo}`, texto);
      return;
    } catch (e) {
      console.error("correo de inventario", e);
    }
  }
  const [principal] = duenos(d.config);
  if (principal) await enviarADueno(principal.telefono, texto, [titulo, "Hoja de Google", detalle], d);
}

/**
 * Copia la hoja de Google a la tabla de productos. Una lectura fallida, sin columnas
 * obligatorias o sin ningún producto válido no toca el inventario (se siguen usando los
 * últimos precios) y al tercer fallo seguido se avisa una vez. Las filas descartadas se
 * avisan una vez por cada conjunto distinto de errores; los «Aviso:» (datos que se
 * completan con un valor por omisión) solo se devuelven.
 */
export async function sincronizarInventario(
  d: Deps,
  leer: () => Promise<string[][]>,
): Promise<ResultadoInventario> {
  let resultado: { activos: number; desactivados: number; errores: string[] };
  try {
    const { productos, errores } = mapearHoja(await leer());
    if (productos.length === 0) throw new Error("La hoja no trajo productos válidos");
    const r = await d.repo.sincronizarProductos(productos);
    resultado = { ...r, errores };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("inventario", mensaje);
    const fallos = Number((await d.repo.leerMarca("fallos_inventario")) ?? "0") + 1;
    await d.repo.escribirMarca("fallos_inventario", String(fallos));
    if (fallos === FALLOS_PARA_AVISAR) {
      await avisarDueno(
        d,
        "Falla de inventario",
        `No pude leer la hoja de inventario ${FALLOS_PARA_AVISAR} veces seguidas: ${mensaje}. El asistente sigue con los últimos precios cargados.`,
        mensaje,
      );
    }
    return { fallo: mensaje };
  }

  await d.repo.escribirMarca("fallos_inventario", "0");
  const graves = resultado.errores.filter((e) => !esAviso(e));
  const huella = graves.join("\n");
  if ((await d.repo.leerMarca("errores_inventario")) !== huella) {
    await d.repo.escribirMarca("errores_inventario", huella);
    if (graves.length > 0) {
      const lineas = graves.slice(0, MAX_LINEAS_AVISO).map((e) => `· ${e}`);
      if (graves.length > MAX_LINEAS_AVISO) lineas.push(`· y ${graves.length - MAX_LINEAS_AVISO} más`);
      await avisarDueno(
        d,
        "Filas de inventario sin cargar",
        [
          `La hoja de inventario tiene ${graves.length} fila(s) que el asistente no pudo cargar:`,
          ...lineas,
          "Las demás se cargaron bien. Corrige la hoja y se actualiza sola en unos minutos.",
        ].join("\n"),
        `${graves.length} fila(s) sin cargar: ${graves[0]}`,
      );
    }
  }
  return resultado;
}
