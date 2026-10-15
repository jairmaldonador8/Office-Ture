import type Anthropic from "@anthropic-ai/sdk";
import type { Mensaje } from "../datos/tipos.js";

type Bloque = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;
type MimeImagen = Anthropic.Base64ImageSource["media_type"];
export type ImagenLista = { base64: string; mime: string };

const MIMES_IMAGEN: ReadonlySet<string> = new Set<MimeImagen>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const esMimeImagen = (mime: string): mime is MimeImagen => MIMES_IMAGEN.has(mime);

function bloques(m: Mensaje, imagenes: Map<string, ImagenLista>): Bloque[] {
  const salida: Bloque[] = [];
  if (m.tipo === "imagen") {
    if (m.autor === "cliente") {
      const img = imagenes.get(m.id);
      if (img && esMimeImagen(img.mime)) {
        salida.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 } });
      } else {
        salida.push({ type: "text", text: "[el cliente mandó una imagen antes]" });
      }
    } else {
      salida.push({ type: "text", text: "[se envió una foto del producto]" });
    }
  }
  const texto = m.autor === "humano" ? `[Bryan escribió]: ${m.texto ?? ""}` : (m.texto ?? "");
  if (texto.trim()) salida.push({ type: "text", text: texto });
  return salida;
}

/**
 * Convierte el hilo guardado en mensajes para Claude: une turnos seguidos del mismo rol,
 * marca lo que escribió Bryan y descarta mensajes de sistema y asistentes iniciales
 * (la API exige que el primer mensaje sea del usuario).
 */
export function aMensajesClaude(
  mensajes: Mensaje[],
  imagenes: Map<string, ImagenLista>,
): Anthropic.MessageParam[] {
  const salida: { role: "user" | "assistant"; content: Bloque[] }[] = [];
  for (const m of mensajes) {
    if (m.autor === "sistema") continue;
    const rol = m.autor === "cliente" ? "user" : "assistant";
    if (salida.length === 0 && rol === "assistant") continue;
    const contenido = bloques(m, imagenes);
    if (contenido.length === 0) continue;
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.role === rol) ultimo.content.push(...contenido);
    else salida.push({ role: rol, content: contenido });
  }
  return salida;
}
