import { describe, expect, it } from "vitest";
import { ESCENARIOS, type Escenario } from "../escenarios.js";
import { correr, productosDeLaHoja } from "../simulador.js";
import { llamadaHerramienta, modeloGuionado, respuestaTexto } from "./apoyo.js";

const escenario = (nombre: string): Escenario => {
  const e = ESCENARIOS.find((x) => x.nombre === nombre);
  if (!e) throw new Error(nombre);
  return e;
};
const fallas = (r: Awaited<ReturnType<typeof correr>>) =>
  r.hallazgos.filter((h) => !h.ok).map((h) => h.regla);

describe("copia de la hoja", () => {
  it("carga los 42 productos reales sin errores", () => {
    const ps = productosDeLaHoja();
    expect(ps).toHaveLength(42);
    expect(ps.find((p) => p.nombre === "Silla ERGO")?.precio).toBe(3100);
    expect(ps.find((p) => p.nombre === "Silla ERGO operativa")?.precio).toBe(1950);
    expect(ps.find((p) => p.nombre === "Silla MOVE")?.precio).toBe(690);
  });
});

describe("simulador con modelo guionado", () => {
  it("silla-ergo: pregunta cuál de las dos y pasa las rúbricas", async () => {
    const modelo = modeloGuionado([
      llamadaHerramienta("buscar_productos", { categoria: "silla", texto: "ergo" }),
      respuestaTexto(
        "Hola, soy Mariana, asistente de OfficeTure. Tenemos dos: la Silla ERGO en $3,100 + IVA y la Silla ERGO operativa en $1,950 + IVA. ¿Cuál te interesa?",
      ),
    ]);
    const r = await correr(escenario("silla-ergo"), modelo);
    expect(fallas(r)).toEqual([]);
    expect(r.transcripcion).toContain("**Cliente:** Hola, cuánto cuesta la silla ergo?");
    expect(r.transcripcion).toContain("**Asistente** (texto): Hola, soy Mariana");
  });

  it("bryan-entra: tras el eco de Bryan el asistente ya no contesta", async () => {
    const modelo = modeloGuionado([
      respuestaTexto("Hola, la Silla LITE está en $1,490 + IVA. ¿Cuántas necesitas?"),
    ]);
    const r = await correr(escenario("bryan-entra"), modelo);
    expect(fallas(r)).toEqual([]);
    expect(r.hallazgos.find((h) => h.regla === "calla_tras_bryan")?.ok).toBe(true);
    expect(modelo.llamadas).toBe(1);
    expect(r.transcripcion).toContain("**Bryan (desde su app):**");
  });

  it("pide-humano: escala con el motivo esperado y avisa al dueño", async () => {
    const modelo = modeloGuionado([
      llamadaHerramienta("escalar", {
        motivo: "pide_humano",
        resumen: "Quiere hablar con una persona",
        urgencia: "hoy",
        tipo_cliente: "individual",
      }),
      respuestaTexto("Claro, Bryan López te atiende en este mismo chat."),
    ]);
    const r = await correr(escenario("pide-humano"), modelo);
    expect(fallas(r)).toEqual([]);
    expect(r.transcripcion).toContain("**Alerta a dueño**");
  });

  it("detecta respuestas que rompen las reglas", async () => {
    const modelo = modeloGuionado([
      respuestaTexto("¡Claro! Te las dejo en $1,350 cada una, soy una persona real."),
    ]);
    const r = await correr(escenario("doce-sillas"), modelo);
    expect(fallas(r)).toEqual(
      expect.arrayContaining([
        "sin_exclamacion#1",
        "iva_junto_al_precio#1",
        "no_dice_ser_humano#1",
        "escala_con_motivo",
      ]),
    );
  });

  it("detecta que pide datos personales sin el aviso de privacidad", async () => {
    const modelo = modeloGuionado([respuestaTexto("Va, ¿me das tu nombre completo y tu dirección?")]);
    const r = await correr(escenario("pide-humano"), modelo);
    expect(fallas(r)).toContain("aviso_antes_de_datos");
  });
});

describe("pasos especiales", () => {
  it("foto-espacio: el cliente manda una imagen que el asistente recibe como adjunto", async () => {
    const modelo = modeloGuionado([
      respuestaTexto("Gracias por la foto. ¿Cuántas personas trabajan en ese espacio?"),
    ]);
    const r = await correr(escenario("foto-espacio"), modelo);
    expect(fallas(r)).toEqual([]);
    expect(r.transcripcion).toContain("**Cliente** (foto): Este es mi espacio");
    expect(modelo.llamadas).toBe(1);
  });

  it("bot-reactiva: tras el comando /bot el asistente vuelve a contestar", async () => {
    const modelo = modeloGuionado([
      respuestaTexto("Hola, la Silla LITE está en $1,490 + IVA. ¿Cuántas necesitas?"),
      respuestaTexto("Para 3 sillas LITE serían $4,470 + IVA. ¿En qué zona las necesitas?"),
    ]);
    const r = await correr(escenario("bot-reactiva"), modelo);
    expect(fallas(r)).toEqual([]);
    expect(r.hallazgos.find((h) => h.regla === "responde_tras_bot")?.ok).toBe(true);
    expect(r.transcripcion).toContain("**Dueño (comando):** /bot 8112345678");
    expect(modelo.llamadas).toBe(2);
  });

  it("silla-ergo: sin preguntar cuál falla la rúbrica", async () => {
    const modelo = modeloGuionado([
      llamadaHerramienta("buscar_productos", { categoria: "silla", texto: "ergo" }),
      respuestaTexto("Tenemos la Silla ERGO en $3,100 + IVA y la Silla ERGO operativa en $1,950 + IVA."),
    ]);
    const r = await correr(escenario("silla-ergo"), modelo);
    expect(fallas(r)).toContain("incluye_todos");
  });
});
