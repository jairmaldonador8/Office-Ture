import { describe, expect, it } from "vitest";
import {
  etiquetaMotivo,
  MOTIVOS_INMEDIATOS,
  MOTIVOS_MARCADOR,
  textoVencimiento,
} from "../../src/flujo/motivos.js";

describe("motivos", () => {
  it("separa inmediatos de marcadores sin traslape", () => {
    const comunes = MOTIVOS_INMEDIATOS.filter((m) => (MOTIVOS_MARCADOR as readonly string[]).includes(m));
    expect(comunes).toEqual([]);
    expect(MOTIVOS_INMEDIATOS).toContain("volumen_10");
    expect(MOTIVOS_MARCADOR).toEqual(["volumen_4", "factura", "planta_alta"]);
  });
  it("texto de vencimiento según motivo", () => {
    expect(textoVencimiento("listo_para_comprar")).toContain("sigue revisando tu pedido");
    expect(textoVencimiento("queja")).toContain("Ya estoy de vuelta");
    expect(textoVencimiento("error_modelo")).toContain("Ya estoy de vuelta");
  });
  it("etiquetas legibles para la alerta", () => {
    expect(etiquetaMotivo("volumen_10")).toBe("10 piezas o más");
  });
});
