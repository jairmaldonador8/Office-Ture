import { beforeEach, describe, expect, it } from "vitest";
import {
  type ContextoHerramientas,
  ejecutarHerramienta,
  HERRAMIENTAS,
} from "../../src/cerebro/herramientas.js";
import { RepoMemoria } from "../../src/datos/memoria.js";
import type { Producto } from "../../src/negocio/productos.js";

const silla = (o: Partial<Producto>): Producto => ({
  slug: "silla-lite",
  categoria: "silla",
  subcategoria: "Operativa",
  nombre: "Silla LITE",
  precio: 1490,
  stock: "proveedor",
  prioridad: "alta",
  uso: ["colaboradores"],
  activo: true,
  ...o,
});

let repo: RepoMemoria;
let ctx: ContextoHerramientas;

beforeEach(async () => {
  repo = new RepoMemoria();
  await repo.sincronizarProductos([
    silla({}),
    silla({
      slug: "silla-mesh",
      nombre: "Silla MESH",
      subcategoria: "Ejecutiva",
      precio: 4200,
      uso: ["direccion"],
      fotoUrl: "https://x/mesh.jpg",
    }),
  ]);
  const c = await repo.crearContacto({ canal: "whatsapp", idExterno: "521" });
  const conv = await repo.crearConversacion(c.id, "whatsapp");
  ctx = { repo, conversacion: conv, fotos: [], resultados: [] };
});

describe("herramientas", () => {
  it("todas tienen esquema estricto sin propiedades extra", () => {
    for (const h of HERRAMIENTAS) {
      expect(h.definicion.input_schema).toMatchObject({ type: "object", additionalProperties: false });
    }
    expect(HERRAMIENTAS.map((h) => h.definicion.name).sort()).toEqual([
      "buscar_productos",
      "enviar_foto",
      "escalar",
      "info_entrega",
      "registrar_lead",
    ]);
  });

  it("las herramientas strict no pasan de 24 parámetros opcionales en total (límite de la API)", () => {
    let opcionales = 0;
    for (const h of HERRAMIENTAS) {
      if (!h.definicion.strict) continue;
      const s = h.definicion.input_schema;
      const props = Object.keys(s.properties ?? {});
      const req = new Set(s.required ?? []);
      opcionales += props.filter((p) => !req.has(p)).length;
    }
    expect(opcionales).toBeLessThanOrEqual(24);
    expect(HERRAMIENTAS.filter((h) => h.definicion.strict).length).toBeGreaterThan(0);
  });

  it("buscar_productos devuelve precio con + IVA y guarda el resultado para auditoría", async () => {
    const r = await ejecutarHerramienta(
      "buscar_productos",
      { categoria: "silla", uso: "colaboradores" },
      ctx,
    );
    expect(r.esError).toBe(false);
    expect(r.contenido).toContain("$1,490 + IVA");
    expect(ctx.resultados[0]).toContain("$1,490 + IVA");
  });

  it("buscar_productos con un texto que coincide con varios modelos los devuelve todos con nombre y precio", async () => {
    await repo.sincronizarProductos([
      silla({ slug: "ergo", nombre: "ERGO", subcategoria: "Ejecutiva", precio: 3900 }),
      silla({ slug: "ergo-operativa", nombre: "ERGO operativa", precio: 2600 }),
      silla({ slug: "core", nombre: "CORE", precio: 2100 }),
    ]);
    const r = await ejecutarHerramienta("buscar_productos", { texto: "ergo" }, ctx);
    const { productos } = JSON.parse(r.contenido) as { productos: { nombre: string; precio: string }[] };
    expect(productos.map((p) => [p.nombre, p.precio])).toHaveLength(2);
    expect(productos.map((p) => [p.nombre, p.precio])).toEqual(
      expect.arrayContaining([
        ["ERGO", "$3,900 + IVA"],
        ["ERGO operativa", "$2,600 + IVA"],
      ]),
    );
  });

  it("buscar_productos sin resultados da una pista", async () => {
    const r = await ejecutarHerramienta("buscar_productos", { categoria: "archivero" }, ctx);
    expect(r.contenido).toContain("fuera_de_inventario");
  });

  it("info_entrega", async () => {
    const r = await ejecutarHerramienta("info_entrega", { municipio: "Apodaca" }, ctx);
    expect(JSON.parse(r.contenido)).toMatchObject({ municipio: "Apodaca", mismoDiaPosible: true });
  });

  it("registrar_lead acumula, marca volumen_4 solo, sube estado y avisa con 10 o más", async () => {
    await ejecutarHerramienta("registrar_lead", { municipio: "Apodaca", estado: "calificado" }, ctx);
    const r = await ejecutarHerramienta(
      "registrar_lead",
      { cantidad: 6, marcador: "factura", estado: "cotizado" },
      ctx,
    );
    const lead = await repo.obtenerLead(ctx.conversacion.id);
    expect(lead).toMatchObject({ municipio: "Apodaca", cantidad: 6, prioritario: true, factura: true });
    expect(lead.motivosPrioridad.sort()).toEqual(["factura", "volumen_4"]);
    expect((await repo.obtenerConversacion(ctx.conversacion.id)).estado).toBe("cotizado");
    expect(r.contenido).not.toContain("volumen_10");
    const r10 = await ejecutarHerramienta("registrar_lead", { cantidad: 12 }, ctx);
    expect(r10.contenido).toContain("volumen_10");
  });

  it("registrar_lead no baja el estado", async () => {
    await ejecutarHerramienta("registrar_lead", { estado: "pedido" }, ctx);
    await ejecutarHerramienta("registrar_lead", { estado: "calificado" }, ctx);
    expect((await repo.obtenerConversacion(ctx.conversacion.id)).estado).toBe("pedido");
  });

  it("escalar deja la intención en el contexto", async () => {
    await ejecutarHerramienta(
      "escalar",
      {
        motivo: "descuento",
        resumen: "Pide mejor precio en 6 sillas LITE",
        urgencia: "esta_semana",
        tipo_cliente: "empresa",
      },
      ctx,
    );
    expect(ctx.escalacion).toEqual({
      motivo: "descuento",
      resumen: "Pide mejor precio en 6 sillas LITE",
      urgencia: "esta_semana",
      tipoCliente: "empresa",
    });
  });

  it("registrar_lead ignora campos vacíos y no pisa datos buenos", async () => {
    await ejecutarHerramienta("registrar_lead", { nombre: "Ana" }, ctx);
    const r = await ejecutarHerramienta("registrar_lead", { nombre: "", empresa: "  " }, ctx);
    expect(r.esError).toBe(false);
    const lead = await repo.obtenerLead(ctx.conversacion.id);
    expect(lead.nombre).toBe("Ana");
    expect(lead.empresa).toBeUndefined();
  });

  it("enviar_foto con el mismo slug dos veces en un turno la agrega una sola vez", async () => {
    await ejecutarHerramienta("enviar_foto", { slug: "silla-mesh" }, ctx);
    const r = await ejecutarHerramienta("enviar_foto", { slug: "silla-mesh" }, ctx);
    expect(JSON.parse(r.contenido)).toMatchObject({ ok: true });
    expect(ctx.fotos).toHaveLength(1);
  });

  it("buscar_productos devuelve máximo tres por defecto y avisa de enviar_foto", async () => {
    await repo.sincronizarProductos(
      [1, 2, 3, 4, 5].map((n) => silla({ slug: `s${n}`, nombre: `S${n}`, precio: 1000 + n })),
    );
    const r = await ejecutarHerramienta("buscar_productos", { categoria: "silla" }, ctx);
    expect((JSON.parse(r.contenido) as { productos: unknown[] }).productos).toHaveLength(3);
    const d = HERRAMIENTAS.find((h) => h.definicion.name === "buscar_productos")?.definicion;
    expect(d?.description).toContain("enviar_foto");
  });

  it("enviar_foto solo si hay foto", async () => {
    expect((await ejecutarHerramienta("enviar_foto", { slug: "silla-lite" }, ctx)).contenido).toContain(
      "no tiene foto",
    );
    await ejecutarHerramienta("enviar_foto", { slug: "silla-mesh" }, ctx);
    expect(ctx.fotos).toEqual([{ url: "https://x/mesh.jpg", pie: "Silla MESH · $4,200 + IVA" }]);
  });

  it("entrada inválida o herramienta desconocida devuelve error sin lanzar", async () => {
    expect((await ejecutarHerramienta("escalar", { motivo: "inventado" }, ctx)).esError).toBe(true);
    expect((await ejecutarHerramienta("borrar_todo", {}, ctx)).esError).toBe(true);
  });

  it("ninguna herramienta acepta un precio del modelo", () => {
    for (const h of HERRAMIENTAS) {
      expect(Object.keys(h.definicion.input_schema.properties ?? {})).not.toContain("precio");
    }
  });
});
