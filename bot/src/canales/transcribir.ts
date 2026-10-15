import { TIEMPO_LIMITE_ARCHIVO_MS } from "./tipos.js";

export type Transcriptor = (bytes: Uint8Array, mime: string) => Promise<string>;

export function transcriptorOpenAI(apiKey: string, f: typeof fetch = fetch): Transcriptor {
  return async (bytes, mime) => {
    const form = new FormData();
    form.set("model", "gpt-4o-mini-transcribe");
    form.set("language", "es");
    const extension = mime.includes("ogg")
      ? "ogg"
      : mime.includes("mp4")
        ? "mp4"
        : mime.includes("mpeg")
          ? "mp3"
          : "webm";
    form.set("file", new Blob([bytes], { type: mime }), `audio.${extension}`);
    const r = await f("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIEMPO_LIMITE_ARCHIVO_MS),
    });
    if (!r.ok) throw new Error(`Transcripción falló: ${r.status}`);
    return ((await r.json()) as { text?: string }).text?.trim() ?? "";
  };
}
