import { describe, expect, it } from "vitest";
import { infoEntrega } from "../../src/negocio/entrega.js";

describe("infoEntrega", () => {
  it("San Nicolás: mismo día posible, gratis desde 40 mil, día siguiente", () => {
    const i = infoEntrega("Col. Anáhuac, San Nicolás de los Garza");
    expect(i).toMatchObject({
      municipio: "San Nicolás",
      entregamos: true,
      mismoDiaPosible: true,
      envioGratisDesde: 40000,
    });
    expect(i.tiempo).toContain("día siguiente");
  });

  it("San Pedro: metropolitano pero sin mismo día ni envío gratis", () => {
    expect(infoEntrega("san pedro garza garcia")).toMatchObject({
      municipio: "San Pedro",
      mismoDiaPosible: false,
      envioGratisDesde: null,
    });
  });

  it("García no se confunde con San Pedro Garza García", () => {
    expect(infoEntrega("Garcia NL").municipio).toBe("García");
  });

  it("Saltillo: foráneo, 2 a 3 días", () => {
    const i = infoEntrega("Saltillo, Coahuila");
    expect(i).toMatchObject({ municipio: "Saltillo", entregamos: true, mismoDiaPosible: false });
    expect(i.tiempo).toContain("2 a 3 días");
  });

  it("General Escobedo se reconoce como Escobedo", () => {
    expect(infoEntrega("Gral. Escobedo").municipio).toBe("Escobedo");
  });

  it("municipio fuera de zona", () => {
    expect(infoEntrega("Reynosa, Tamaulipas")).toMatchObject({ municipio: null, entregamos: false });
  });

  it("siempre incluye maniobras y recolección", () => {
    const i = infoEntrega("Monterrey");
    expect(i.maniobras).toContain("$200 a $500");
    expect(i.recoleccion).toContain("3 horas");
  });

  describe("el municipio al final gana sobre calles y colonias", () => {
    it.each([
      ["Calle Allende, García", "García"],
      ["Calle Guadalupe, San Pedro", "San Pedro"],
      ["Av. Juárez 123, Monterrey", "Monterrey"],
      ["Calle Hidalgo, San Nicolás de los Garza", "San Nicolás"],
    ])("%s -> %s", (lugar, esperado) => {
      expect(infoEntrega(lugar).municipio).toBe(esperado);
    });
  });

  describe("homónimos de otros estados", () => {
    it.each(["Ciudad Juárez, Chihuahua", "Guadalupe, Zacatecas", "Pachuca, Hidalgo"])(
      "%s -> fuera de zona",
      (lugar) => {
        expect(infoEntrega(lugar)).toMatchObject({ municipio: null, entregamos: false });
      },
    );

    it.each([
      ["Juárez, N.L.", "Juárez"],
      ["Guadalupe", "Guadalupe"],
      ["Hidalgo", "Hidalgo"],
      ["Hidalgo, Nuevo León", "Hidalgo"],
      ["Guadalupe, Zacatecas, Nuevo León", "Guadalupe"],
    ])("%s -> %s", (lugar, esperado) => {
      expect(infoEntrega(lugar).municipio).toBe(esperado);
    });
  });

  describe("normalización", () => {
    it.each([
      ["San Nicolas", "San Nicolás"],
      ["Monterrey centro", "Monterrey"],
      ["  col.   Anáhuac,    SAN   NICOLÁS  ", "San Nicolás"],
      ["SAN PEDRO GARZA GARCÍA", "San Pedro"],
    ])("%s -> %s", (lugar, esperado) => {
      expect(infoEntrega(lugar).municipio).toBe(esperado);
    });
  });
});
