import { describe, expect, it } from "vitest";
import { cargarConfig, duenos, esDueno } from "../../src/config.js";

const envBase = {
  META_APP_SECRET: "secreto",
  META_VERIFY_TOKEN: "verifica",
  WA_PHONE_NUMBER_ID: "123",
  WA_TOKEN: "tok",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  ANTHROPIC_API_KEY: "sk-ant",
  DUENOS: "Bryan:5218111111111,Socio:5218122222222",
  AVISO_PRIVACIDAD_URL: "https://officeture.mx/privacidad",
  CRON_SECRET: "0123456789abcdef",
};

describe("config", () => {
  it("aplica valores por defecto", () => {
    const c = cargarConfig(envBase);
    expect(c.CLAUDE_MODEL).toBe("claude-sonnet-5-5");
    expect(c.NOMBRE_ASISTENTE).toBe("Mariana");
    expect(c.META_GRAPH_VERSION).toBe("v25.0");
    expect(c.HOJA_PESTANA).toBe("Import_GHL");
  });

  it("falla si falta el secreto de Meta", () => {
    const { META_APP_SECRET: _, ...resto } = envBase;
    expect(() => cargarConfig(resto)).toThrow();
  });

  it("lee dueños en orden, el primero es el principal", () => {
    expect(duenos(cargarConfig(envBase))).toEqual([
      { nombre: "Bryan", telefono: "5218111111111" },
      { nombre: "Socio", telefono: "5218122222222" },
    ]);
  });

  it("reconoce a un dueño por los últimos 10 dígitos", () => {
    const c = cargarConfig(envBase);
    expect(esDueno(c, "528111111111")).toBe(true);
    expect(esDueno(c, "5218133333333")).toBe(false);
  });

  it("descarta dueños sin teléfono y nunca reconoce un número vacío", () => {
    const c = cargarConfig({ ...envBase, DUENOS: "Bryan:5218111111111,Fantasma:,Otro:abc" });
    expect(duenos(c)).toEqual([{ nombre: "Bryan", telefono: "5218111111111" }]);
    expect(esDueno(c, "")).toBe(false);
  });
});
