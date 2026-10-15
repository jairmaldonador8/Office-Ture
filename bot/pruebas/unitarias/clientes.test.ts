import { describe, expect, it } from "vitest";
import { ClienteInstagram } from "../../src/canales/instagram.js";
import { ErrorMeta, esFueraDeVentana } from "../../src/canales/tipos.js";
import { transcriptorOpenAI } from "../../src/canales/transcribir.js";
import { ClienteWhatsApp } from "../../src/canales/whatsapp.js";

type Llamada = { url: string; init: RequestInit | undefined };

function fetchFalso(respuestas: ((url: string) => Response | undefined)[]) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init });
    for (const r of respuestas) {
      const res = r(String(url));
      if (res) return res;
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { f, llamadas };
}

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const cuerpo = (l: Llamada | undefined) => JSON.parse(String(l?.init?.body));
const cabeceras = (l: Llamada | undefined) => (l?.init?.headers ?? {}) as Record<string, string>;

describe("ClienteWhatsApp", () => {
  it("texto: forma del cuerpo, token y id devuelto", async () => {
    const { f, llamadas } = fetchFalso([
      (u) => (u.endsWith("/123/messages") ? json({ messages: [{ id: "wamid.out" }] }) : undefined),
    ]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "tok", version: "v25.0", fetch: f });
    expect(await wa.texto("5218112345678", "Hola")).toBe("wamid.out");
    expect(llamadas[0]?.url).toBe("https://graph.facebook.com/v25.0/123/messages");
    expect(cabeceras(llamadas[0]).Authorization).toBe("Bearer tok");
    expect(cuerpo(llamadas[0])).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5218112345678",
      type: "text",
      text: { body: "Hola", preview_url: false },
    });
  });

  it("toda llamada lleva timeout (AbortSignal)", async () => {
    const { f, llamadas } = fetchFalso([() => json({ messages: [{ id: "w" }] })]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    await wa.texto("521", "x");
    expect(llamadas[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("plantilla con variables en el cuerpo", async () => {
    const { f, llamadas } = fetchFalso([() => json({ messages: [{ id: "w" }] })]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    await wa.plantilla("521", "alerta_bryan", ["Pide descuento", "Laura"]);
    expect(cuerpo(llamadas[0]).template).toEqual({
      name: "alerta_bryan",
      language: { code: "es_MX" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Pide descuento" },
            { type: "text", text: "Laura" },
          ],
        },
      ],
    });
  });

  it("escribiendo marca leído con indicador y no lanza si falla", async () => {
    const { f, llamadas } = fetchFalso([() => json({ error: { message: "x" } }, 400)]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    await expect(wa.escribiendo("521", "wamid.in")).resolves.toBeUndefined();
    expect(cuerpo(llamadas[0])).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.in",
      typing_indicator: { type: "text" },
    });
  });

  it("error de Meta lanza con el mensaje", async () => {
    const { f } = fetchFalso([
      () => json({ error: { message: "Recipient not in allowed list", code: 131030 } }, 400),
    ]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    await expect(wa.texto("521", "x")).rejects.toThrow(/131030/);
  });

  it("131047 (más de 24 h) lanza ErrorMeta con fueraDeVentana", async () => {
    const { f } = fetchFalso([
      () => json({ error: { message: "Re-engagement message", code: 131047 } }, 400),
    ]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    const e = await wa.texto("521", "x").catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ErrorMeta);
    expect((e as ErrorMeta).codigo).toBe(131047);
    expect((e as ErrorMeta).fueraDeVentana).toBe(true);
    expect(esFueraDeVentana(e)).toBe(true);
  });

  it("otros errores no son fueraDeVentana y no exponen el token", async () => {
    const { f } = fetchFalso([() => json({ error: { message: "x", code: 131030 } }, 400)]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "secreto", version: "v25.0", fetch: f });
    const e = await wa.texto("521", "x").catch((err: unknown) => err);
    expect(esFueraDeVentana(e)).toBe(false);
    expect(String((e as Error).message)).not.toContain("secreto");
    expect(esFueraDeVentana(new Error("x"))).toBe(false);
  });

  it("descargarMedia pide la URL y luego los bytes con token", async () => {
    const { f, llamadas } = fetchFalso([
      (u) =>
        u === "https://graph.facebook.com/v25.0/m1"
          ? json({ url: "https://lookaside/m1", mime_type: "audio/ogg" })
          : undefined,
      (u) => (u === "https://lookaside/m1" ? new Response(new Uint8Array([1, 2, 3])) : undefined),
    ]);
    const wa = new ClienteWhatsApp({ phoneNumberId: "123", token: "t", version: "v25.0", fetch: f });
    const m = await wa.descargarMedia({ mediaId: "m1" });
    expect([...m.bytes]).toEqual([1, 2, 3]);
    expect(m.mime).toBe("audio/ogg");
    expect(cabeceras(llamadas[1]).Authorization).toBe("Bearer t");
  });
});

describe("ClienteInstagram", () => {
  it("texto recorta a 1000 bytes y devuelve message_id", async () => {
    const { f, llamadas } = fetchFalso([() => json({ recipient_id: "IG", message_id: "mid.out" })]);
    const ig = new ClienteInstagram({ pageToken: "pt", version: "v25.0", fetch: f });
    expect(await ig.texto("IG", "á".repeat(800))).toBe("mid.out");
    const b = cuerpo(llamadas[0]);
    expect(llamadas[0]?.url).toBe("https://graph.facebook.com/v25.0/me/messages");
    expect(b.recipient).toEqual({ id: "IG" });
    expect(Buffer.byteLength(b.message.text)).toBeLessThanOrEqual(1000);
    expect(llamadas[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fuera de la ventana de 24 h lanza ErrorMeta con fueraDeVentana", async () => {
    const { f } = fetchFalso([
      () =>
        json(
          {
            error: {
              message: "This message is sent outside of allowed window.",
              code: 10,
              error_subcode: 2018278,
            },
          },
          400,
        ),
    ]);
    const ig = new ClienteInstagram({ pageToken: "pt", version: "v25.0", fetch: f });
    const e = await ig.texto("IG", "hola").catch((err: unknown) => err);
    expect(esFueraDeVentana(e)).toBe(true);
  });

  it("plantilla no existe en Instagram", async () => {
    const ig = new ClienteInstagram({ pageToken: "pt", version: "v25.0", fetch: fetchFalso([]).f });
    await expect(ig.plantilla("IG", "x", [])).rejects.toThrow(/Instagram/);
  });
});

describe("transcriptorOpenAI", () => {
  it("manda el audio y devuelve el texto", async () => {
    const { f, llamadas } = fetchFalso([() => json({ text: "quiero seis sillas" })]);
    const t = transcriptorOpenAI("sk", f);
    expect(await t(new Uint8Array([1]), "audio/ogg")).toBe("quiero seis sillas");
    expect(llamadas[0]?.url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const form = llamadas[0]?.init?.body as FormData;
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("es");
    expect(llamadas[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
