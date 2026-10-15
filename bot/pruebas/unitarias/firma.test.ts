import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firmaValida } from "../../src/canales/firma.js";

const secreto = "app-secret";
const cuerpo = '{"object":"whatsapp_business_account","entry":[]}';
const firma = `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;

describe("firma de Meta", () => {
  it("acepta la firma correcta", () => {
    expect(firmaValida(cuerpo, firma, secreto)).toBe(true);
  });
  it("rechaza cuerpo alterado", () => {
    expect(firmaValida(`${cuerpo} `, firma, secreto)).toBe(false);
  });
  it("rechaza encabezado ausente o sin prefijo", () => {
    expect(firmaValida(cuerpo, null, secreto)).toBe(false);
    expect(firmaValida(cuerpo, firma.slice(7), secreto)).toBe(false);
  });
  it("rechaza longitud distinta sin lanzar error", () => {
    expect(firmaValida(cuerpo, "sha256=abc", secreto)).toBe(false);
  });
});
