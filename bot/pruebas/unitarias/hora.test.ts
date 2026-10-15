import { describe, expect, it } from "vitest";
import { ajustarVentanaToques, aLocal, enHorario, local, siguienteDiaHabilA } from "../../src/hora.js";

// 2026-10-09 es viernes.
describe("hora de Monterrey", () => {
  it("convierte UTC a hora local UTC-6", () => {
    const l = local(new Date("2026-10-09T16:30:00Z"));
    expect(l).toMatchObject({ dia: 5, hora: 10.5, anio: 2026, mes: 9, fecha: 9 });
  });

  it("aLocal construye la fecha UTC de una hora local", () => {
    expect(aLocal(2026, 9, 9, 9).toISOString()).toBe("2026-10-09T15:00:00.000Z");
  });

  it("horario: viernes 10:30 sí, viernes 19:30 no, sábado 9:30 no, sábado 10:30 sí, domingo no", () => {
    expect(enHorario(aLocal(2026, 9, 9, 10, 30))).toBe(true);
    expect(enHorario(aLocal(2026, 9, 9, 19, 30))).toBe(false);
    expect(enHorario(aLocal(2026, 9, 10, 9, 30))).toBe(false);
    expect(enHorario(aLocal(2026, 9, 10, 10, 30))).toBe(true);
    expect(enHorario(aLocal(2026, 9, 11, 12))).toBe(false);
  });

  it("siguiente día hábil a las 11:00 salta el domingo", () => {
    const sabadoNoche = aLocal(2026, 9, 10, 21);
    expect(siguienteDiaHabilA(sabadoNoche, 11).toISOString()).toBe(aLocal(2026, 9, 12, 11).toISOString());
  });

  it("toques: fuera de 9 a 20 se mueven a las 9:00 siguientes", () => {
    expect(ajustarVentanaToques(aLocal(2026, 9, 9, 21)).toISOString()).toBe(
      aLocal(2026, 9, 10, 9).toISOString(),
    );
    expect(ajustarVentanaToques(aLocal(2026, 9, 9, 7)).toISOString()).toBe(
      aLocal(2026, 9, 9, 9).toISOString(),
    );
    expect(ajustarVentanaToques(aLocal(2026, 9, 9, 15)).toISOString()).toBe(
      aLocal(2026, 9, 9, 15).toISOString(),
    );
  });
});
