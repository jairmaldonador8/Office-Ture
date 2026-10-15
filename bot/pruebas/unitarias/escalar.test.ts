import { describe, expect, it, vi } from "vitest";
import { ErrorMeta } from "../../src/canales/tipos.js";
import { ejecutarEscalacion, enviarADueno, textoAlerta } from "../../src/flujo/escalar.js";
import { aLocal } from "../../src/hora.js";
import { depsDePrueba, INICIO } from "./apoyo.js";

async function preparar(o: Parameters<typeof depsDePrueba>[0] = {}) {
  const p = depsDePrueba(o);
  const c = await p.repo.crearContacto({
    canal: "whatsapp",
    idExterno: "5218112345678",
    telefono: "5218112345678",
    nombre: "Laura",
  });
  const conv = await p.repo.crearConversacion(c.id, "whatsapp");
  await p.repo.actualizarLead(conv.id, { producto: "Silla LITE", cantidad: 6, municipio: "Apodaca" });
  return { ...p, conv };
}

const esc = {
  motivo: "descuento",
  resumen: "Pide mejor precio en 6 sillas LITE",
  urgencia: "esta_semana",
  tipoCliente: "empresa",
};

describe("ejecutarEscalacion", () => {
  it("en horario y con ventana del dueño abierta: alerta por texto, espera 2 h, estado transferido", async () => {
    const { deps, repo, wa, conv } = await preparar();
    await repo.registrarVentanaDueno("5218111111111", new Date(INICIO.getTime() - 3_600_000));
    await ejecutarEscalacion(conv.id, esc, deps);
    const c = await repo.obtenerConversacion(conv.id);
    expect(c).toMatchObject({ modo: "esperando_humano", motivoModo: "descuento", estado: "transferido" });
    expect(c.modoHasta).toEqual(new Date(INICIO.getTime() + 2 * 3_600_000));
    const [alerta] = wa.textos("5218111111111");
    expect(alerta).toContain("Pide descuento");
    expect(alerta).toContain("Cantidad: 6");
    expect(alerta).toContain("/ganado 8112345678");
    expect(repo.alertas).toHaveLength(1);
    expect(repo.alertas[0]).toMatchObject({ motivo: "descuento", idExterno: "out.1", diferida: false });
    expect((await repo.obtenerLead(conv.id)).motivoEscalacion).toBe("descuento");
    expect(wa.enviados.filter((e) => e.para === "5218122222222")).toHaveLength(0);
  });

  it("sin ventana del dueño usa la plantilla alerta_bryan con 3 variables sin saltos de línea", async () => {
    const { deps, wa, conv } = await preparar();
    await ejecutarEscalacion(conv.id, esc, deps);
    const p = wa.enviados.find((e) => e.tipo === "plantilla");
    expect(p).toMatchObject({ para: "5218111111111", plantilla: "alerta_bryan" });
    expect(p?.variables).toHaveLength(3);
    expect(p?.variables?.every((v) => !v.includes("\n"))).toBe(true);
  });

  it("fuera de horario: vence a las 11:00 del siguiente día hábil y la alerta queda diferida", async () => {
    const { deps, repo, reloj, conv } = await preparar();
    reloj.fijar(aLocal(2026, 9, 10, 21)); // sábado 21:00
    await ejecutarEscalacion(conv.id, esc, deps);
    expect((await repo.obtenerConversacion(conv.id)).modoHasta).toEqual(aLocal(2026, 9, 12, 11));
    expect(repo.alertas[0]?.diferida).toBe(true);
  });

  it("proveedor y error del modelo no cambian el estado", async () => {
    const { deps, repo, conv } = await preparar();
    await ejecutarEscalacion(conv.id, { ...esc, motivo: "proveedor" }, deps);
    expect((await repo.obtenerConversacion(conv.id)).estado).toBe("nuevo");
  });

  it("manda copia por correo si está configurado", async () => {
    const correos: string[] = [];
    const { deps, conv } = await preparar({
      correo: async (asunto) => {
        correos.push(asunto);
      },
    });
    await ejecutarEscalacion(conv.id, esc, deps);
    expect(correos).toEqual(["OfficeTure · Pide descuento"]);
  });

  it("si el envío falla no lanza: registra la alerta sin id externo para que el cron la reenvíe", async () => {
    const { deps, repo, wa, conv } = await preparar({
      correo: async () => {
        throw new Error("Resend caído");
      },
    });
    wa.falla = true;
    await expect(ejecutarEscalacion(conv.id, esc, deps)).resolves.toBeUndefined();
    expect(repo.alertas).toHaveLength(1);
    expect(repo.alertas[0]?.idExterno).toBeUndefined();
    expect((await repo.obtenerConversacion(conv.id)).modo).toBe("esperando_humano");
  });

  it("repetir la misma escalación no duplica alerta, correo ni reinicia la espera, pero actualiza el resumen", async () => {
    const correos: string[] = [];
    const { deps, repo, wa, reloj, conv } = await preparar({
      correo: async (a) => {
        correos.push(a);
      },
    });
    await ejecutarEscalacion(conv.id, esc, deps);
    const hasta = (await repo.obtenerConversacion(conv.id)).modoHasta;
    reloj.fijar(new Date(INICIO.getTime() + 600_000));
    await ejecutarEscalacion(conv.id, { ...esc, resumen: "Resumen más nuevo" }, deps);
    expect(repo.alertas).toHaveLength(1);
    expect(wa.enviados).toHaveLength(1);
    expect(correos).toHaveLength(1);
    expect((await repo.obtenerConversacion(conv.id)).modoHasta).toEqual(hasta);
    expect((await repo.obtenerLead(conv.id)).resumen).toBe("Resumen más nuevo");
  });

  it("otro motivo mientras ya espera genera una alerta nueva", async () => {
    const { deps, repo, conv } = await preparar();
    await ejecutarEscalacion(conv.id, esc, deps);
    await ejecutarEscalacion(conv.id, { ...esc, motivo: "queja" }, deps);
    expect(repo.alertas).toHaveLength(2);
  });

  it("si la alerta anterior ya se atendió, una nueva escalación del mismo motivo sí alerta", async () => {
    const { deps, repo, conv } = await preparar();
    await ejecutarEscalacion(conv.id, esc, deps);
    await repo.atenderAlertas(conv.id, INICIO);
    await ejecutarEscalacion(conv.id, esc, deps);
    expect(repo.alertas).toHaveLength(2);
  });

  it("limpia tabuladores y retornos de las variables de plantilla y corta a 900 en límite de palabra", async () => {
    const { deps, wa, conv } = await preparar();
    const largo = `${"palabra ".repeat(200)}fin`;
    await ejecutarEscalacion(conv.id, { ...esc, resumen: `uno\tdos\r\ntres\t\t${largo}` }, deps);
    const v = wa.enviados.find((e) => e.tipo === "plantilla")?.variables?.[2] ?? "";
    expect(v).not.toMatch(/[\t\r\n]/);
    expect(v.startsWith("uno dos tres palabra")).toBe(true);
    expect(v.length).toBeLessThanOrEqual(901);
    expect(v.endsWith("palabra…")).toBe(true);
  });

  it("sin dueño configurado registra un error en consola", async () => {
    const { deps, conv } = await preparar();
    deps.config = { ...deps.config, DUENOS: "" };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await ejecutarEscalacion(conv.id, esc, deps);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("enviarADueno", () => {
  it("si Meta dice fuera de ventana al mandar texto, reintenta con la plantilla", async () => {
    const { deps, repo, wa } = depsDePrueba();
    await repo.registrarVentanaDueno("5218111111111", new Date(INICIO.getTime() - 3_600_000));
    wa.texto = async () => {
      throw new ErrorMeta("whatsapp", 400, 131047, undefined, "fuera de ventana");
    };
    const id = await enviarADueno("5218111111111", "Hola\nBryan", ["Motivo", "Cliente", "Resumen"], deps);
    expect(id).toBe("out.1");
    expect(wa.enviados).toEqual([
      {
        tipo: "plantilla",
        para: "5218111111111",
        plantilla: "alerta_bryan",
        variables: ["Motivo", "Cliente", "Resumen"],
      },
    ]);
  });

  it("otro error al mandar texto no usa plantilla y devuelve undefined", async () => {
    const { deps, repo, wa } = depsDePrueba();
    await repo.registrarVentanaDueno("5218111111111", new Date(INICIO.getTime() - 3_600_000));
    wa.texto = async () => {
      throw new Error("red");
    };
    expect(await enviarADueno("5218111111111", "Hola", ["a", "b", "c"], deps)).toBeUndefined();
    expect(wa.enviados).toHaveLength(0);
  });
});

describe("textoAlerta", () => {
  it("Instagram usa @usuario y omite datos vacíos", () => {
    const t = textoAlerta({
      motivo: "queja",
      contacto: { id: "c", canal: "instagram", idExterno: "IG1", usuario: "laura.oficina" },
      lead: {
        conversacionId: "x",
        prioritario: false,
        motivosPrioridad: [],
        escaladoSinAtender: false,
        avisoEnviado: false,
        noContactar: false,
      },
      resumen: "Silla con rueda rota",
    });
    expect(t).toContain("@laura.oficina (Instagram)");
    expect(t).not.toContain("Cantidad");
    expect(t).toContain("/bot @laura.oficina");
  });

  it("incluye urgencia y tipo de cliente cuando existen", () => {
    const t = textoAlerta({
      motivo: "descuento",
      contacto: { id: "c", canal: "whatsapp", idExterno: "5218112345678" },
      lead: {
        conversacionId: "x",
        prioritario: false,
        motivosPrioridad: [],
        escaladoSinAtender: false,
        avisoEnviado: false,
        noContactar: false,
        urgencia: "esta_semana",
        tipoCliente: "empresa",
      },
      resumen: "r",
    });
    expect(t).toContain("Urgencia: esta_semana");
    expect(t).toContain("Tipo: empresa");
  });
});
