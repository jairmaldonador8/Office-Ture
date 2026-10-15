import { describe, expect, it } from "vitest";
import { type EstadoSeguimiento, siguienteToque } from "../../src/flujo/seguimiento.js";
import { aLocal } from "../../src/hora.js";

const base = (o: Partial<EstadoSeguimiento> = {}): EstadoSeguimiento => ({
  canal: "whatsapp",
  modo: "bot",
  estado: "cotizado",
  toques: 0,
  noContactar: false,
  ultimoCliente: aLocal(2026, 9, 9, 10),
  ultimoBot: aLocal(2026, 9, 9, 10, 1),
  ...o,
});

describe("siguienteToque", () => {
  it("toque 1 a las 3 h del último mensaje del bot, texto libre", () => {
    expect(siguienteToque(base())).toEqual({
      tipo: "toque1",
      programadoPara: aLocal(2026, 9, 9, 13, 1),
      usarPlantilla: false,
    });
  });

  it("toque 1 que cae después de las 20:00 se mueve a las 9:00", () => {
    const r = siguienteToque(
      base({ ultimoCliente: aLocal(2026, 9, 9, 18), ultimoBot: aLocal(2026, 9, 9, 18) }),
    );
    expect(r?.programadoPara).toEqual(aLocal(2026, 9, 10, 9));
    expect(r?.usarPlantilla).toBe(false);
  });

  it("toque 2 al día siguiente 10:00 con plantilla si no hay ventana de anuncio", () => {
    expect(siguienteToque(base({ toques: 1, ultimoBot: aLocal(2026, 9, 9, 13) }))).toEqual({
      tipo: "toque2",
      programadoPara: aLocal(2026, 9, 10, 10),
      usarPlantilla: true,
    });
  });

  it("toque 2 sin plantilla dentro de la ventana gratuita de anuncio", () => {
    const r = siguienteToque(
      base({ toques: 1, ultimoBot: aLocal(2026, 9, 9, 13), ventanaGratisHasta: aLocal(2026, 9, 12, 10) }),
    );
    expect(r).toMatchObject({ tipo: "toque2", usarPlantilla: false });
  });

  it("después de 2 toques programa el cierre a las 24 h", () => {
    expect(siguienteToque(base({ toques: 2, ultimoBot: aLocal(2026, 9, 10, 10) }))).toEqual({
      tipo: "cierre",
      programadoPara: aLocal(2026, 9, 11, 10),
      usarPlantilla: false,
    });
  });

  it("Instagram: sin toque 2 fuera de la ventana de 24 h, va directo a cierre", () => {
    const r = siguienteToque(base({ canal: "instagram", toques: 1, ultimoBot: aLocal(2026, 9, 9, 13) }));
    expect(r).toEqual({ tipo: "cierre", programadoPara: aLocal(2026, 9, 10, 10), usarPlantilla: false });
  });

  it("no hay seguimiento si el modo no es bot, si pidió no contacto o si el estado no aplica", () => {
    expect(siguienteToque(base({ modo: "humano" }))).toBeNull();
    expect(siguienteToque(base({ modo: "esperando_humano" }))).toBeNull();
    expect(siguienteToque(base({ noContactar: true }))).toBeNull();
    expect(siguienteToque(base({ estado: "transferido" }))).toBeNull();
    expect(siguienteToque(base({ estado: "frio" }))).toBeNull();
  });
});
