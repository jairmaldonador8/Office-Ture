import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { correoResend } from "../../src/canales/correo.js";
import { autorizado, manejarWebhook, verificarSuscripcion } from "../../src/flujo/webhook.js";
import { depsDePrueba } from "./apoyo.js";

const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            contacts: [{ wa_id: "521", profile: { name: "L" } }],
            messages: [{ from: "521", id: "wamid.x", timestamp: "1", type: "text", text: { body: "hola" } }],
          },
        },
      ],
    },
  ],
});
const firmar = (c: string) => `sha256=${createHmac("sha256", "secreto").update(c).digest("hex")}`;
const post = (cuerpo: string, firma?: string) =>
  new Request("https://bot/api/webhook/whatsapp", {
    method: "POST",
    body: cuerpo,
    headers: firma ? { "x-hub-signature-256": firma } : {},
  });

describe("webhook", () => {
  it("verificación de suscripción", async () => {
    const ok = verificarSuscripcion(
      new Request("https://bot/x?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123"),
      "verifica",
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    expect(
      verificarSuscripcion(
        new Request("https://bot/x?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1"),
        "verifica",
      ).status,
    ).toBe(403);
    expect(verificarSuscripcion(new Request("https://bot/x?hub.challenge=1"), "verifica").status).toBe(403);
  });

  it("firma inválida o ausente: 401 y nada guardado", async () => {
    const { deps, repo } = depsDePrueba();
    const diferidos: Promise<unknown>[] = [];
    const r = await manejarWebhook(post(payload, "sha256=00"), "whatsapp", deps, (p) => diferidos.push(p));
    expect(r.status).toBe(401);
    expect((await manejarWebhook(post(payload), "whatsapp", deps, (p) => diferidos.push(p))).status).toBe(
      401,
    );
    expect(repo.eventos.size).toBe(0);
    expect(diferidos).toHaveLength(0);
  });

  it("firma válida pero cuerpo que no es JSON: 200 para que Meta no reintente", async () => {
    const { deps, repo } = depsDePrueba();
    const r = await manejarWebhook(post("no es json", firmar("no es json")), "whatsapp", deps, () => {});
    expect(r.status).toBe(200);
    expect(repo.eventos.size).toBe(0);
  });

  it("firma válida: guarda, responde 200 y procesa diferido una sola vez", async () => {
    const { deps, repo } = depsDePrueba();
    const diferidos: Promise<unknown>[] = [];
    const r = await manejarWebhook(post(payload, firmar(payload)), "whatsapp", deps, (p) =>
      diferidos.push(p),
    );
    expect(r.status).toBe(200);
    await Promise.all(diferidos);
    expect(repo.eventos.get("wamid.x")?.procesado).toBeDefined();
    expect(repo.mensajes).toHaveLength(1);
    await manejarWebhook(post(payload, firmar(payload)), "whatsapp", deps, (p) => diferidos.push(p));
    await Promise.all(diferidos);
    expect(repo.mensajes).toHaveLength(1);
    expect(diferidos).toHaveLength(1);
  });

  it("autorizado compara el Bearer", () => {
    const con = (h: string) => new Request("https://x", { headers: { authorization: h } });
    expect(autorizado(con("Bearer abc"), "abc")).toBe(true);
    expect(autorizado(new Request("https://x"), "abc")).toBe(false);
    expect(autorizado(con("Bearer abd"), "abc")).toBe(false);
    expect(autorizado(con("Bearer abcd"), "abc")).toBe(false);
    expect(autorizado(con("abc"), "abc")).toBe(false);
    expect(autorizado(con("Bearer "), "")).toBe(false);
  });
});

describe("correo por Resend", () => {
  it("manda asunto y texto al destinatario", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await correoResend("re_x", "Bot <bot@x.mx>", "bryan@x.mx", f)("Asunto", "Texto");
    expect(llamadas[0]?.url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(llamadas[0]?.init.body))).toEqual({
      from: "Bot <bot@x.mx>",
      to: ["bryan@x.mx"],
      subject: "Asunto",
      text: "Texto",
    });
  });

  it("lanza si Resend responde con error", async () => {
    const f = (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch;
    await expect(correoResend("re_x", "a@x.mx", "b@x.mx", f)("A", "T")).rejects.toThrow("Resend 422");
  });
});
