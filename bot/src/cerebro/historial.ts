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

/**
 * Un envío del bot sigue sin id externo pasado este plazo: Meta nunca confirmó que saliera
 * (se agotó el tiempo, falló la red) y ningún eco lo reconoció.
 */
const SIN_CONFIRMAR_MS = 2 * 60_000;
const AVISO_SIN_CONFIRMAR = "[puede que este mensaje no le haya llegado al cliente]";

const sinConfirmar = (m: Mensaje, ahora: Date | undefined): boolean =>
  ahora !== undefined &&
  m.autor === "bot" &&
  m.idExterno === undefined &&
  ahora.getTime() - m.creado.getTime() > SIN_CONFIRMAR_MS;

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
 * (la API exige que el primer mensaje sea del usuario). Con `ahora` (la hora del turno), los
 * envíos del bot que llevan más de 2 minutos sin id externo se marcan como posiblemente no
 * entregados; sin `ahora` no se marca nada.
 */
export function aMensajesClaude(
  mensajes: Mensaje[],
  imagenes: Map<string, ImagenLista>,
  ahora?: Date,
): Anthropic.MessageParam[] {
  const salida: { role: "user" | "assistant"; content: Bloque[] }[] = [];
  for (const m of mensajes) {
    if (m.autor === "sistema") continue;
    const rol = m.autor === "cliente" ? "user" : "assistant";
    if (salida.length === 0 && rol === "assistant") continue;
    const contenido = bloques(m, imagenes);
    if (contenido.length === 0) continue;
    if (sinConfirmar(m, ahora)) contenido.unshift({ type: "text", text: AVISO_SIN_CONFIRMAR });
    const ultimo = salida[salida.length - 1];
    if (ultimo && ultimo.role === rol) ultimo.content.push(...contenido);
    else salida.push({ role: rol, content: contenido });
  }
  return salida;
}
