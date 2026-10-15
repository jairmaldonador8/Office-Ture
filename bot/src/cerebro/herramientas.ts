import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Conversacion, Estado, Lead, Repo } from "../datos/tipos.js";
import { MOTIVOS_MARCADOR, MOTIVOS_PARA_MODELO } from "../flujo/motivos.js";
import { infoEntrega } from "../negocio/entrega.js";
import { formatoPrecio, USOS } from "../negocio/productos.js";

export interface Escalacion {
  motivo: string;
  resumen: string;
  urgencia: string;
  tipoCliente: string;
}

export interface ContextoHerramientas {
  repo: Repo;
  conversacion: Conversacion;
  escalacion?: Escalacion;
  fotos: { url: string; pie: string }[];
  /** Resultados de herramientas de este turno, para auditar precios en las evals. */
  resultados: string[];
}

interface Herramienta {
  definicion: Anthropic.Tool;
  esquema: z.ZodType;
  ejecutar(input: never, ctx: ContextoHerramientas): Promise<unknown>;
}

const URGENCIAS = ["hoy", "manana", "esta_semana", "sin_urgencia"] as const;
const TIPOS_CLIENTE = ["individual", "empresa", "volumen", "proyecto"] as const;
const ESTADOS_LEAD = ["calificado", "cotizado", "pedido"] as const;
const ORDEN_ESTADO: Record<Estado, number> = {
  nuevo: 0,
  calificado: 1,
  cotizado: 2,
  pedido: 3,
  transferido: 4,
  ganado: 5,
  perdido: 5,
  frio: 0,
};

const STOCK_TEXTO = {
  alto: "stock alto",
  medio: "stock medio",
  bajo: "pocas piezas",
  proveedor: "disponible con proveedor",
} as const;

function herramienta<S extends z.ZodType>(
  nombre: string,
  descripcion: string,
  propiedades: Record<string, unknown>,
  requeridas: string[],
  esquema: S,
  ejecutar: (input: z.infer<S>, ctx: ContextoHerramientas) => Promise<unknown>,
  // La API admite como máximo 24 parámetros opcionales sumando todas las herramientas strict.
  // registrar_lead tiene 20 por sí sola, así que va sin strict; zod la valida igual.
  strict = true,
): Herramienta {
  return {
    definicion: {
      name: nombre,
      description: descripcion,
      ...(strict ? { strict: true } : {}),
      input_schema: {
        type: "object",
        properties: propiedades,
        required: requeridas,
        additionalProperties: false,
      },
    } as Anthropic.Tool,
    esquema,
    ejecutar: ejecutar as Herramienta["ejecutar"],
  };
}

const buscarProductos = herramienta(
  "buscar_productos",
  "Busca productos de entrega inmediata activos con su precio real (+ IVA), stock y uso recomendado. Úsala antes de mencionar cualquier precio, modelo, medida o color. Los resultados con tieneFoto en true se pueden mandar con enviar_foto.",
  {
    categoria: { type: "string", enum: ["escritorio", "archivero", "silla"] },
    subcategoria: {
      type: "string",
      description: "Por ejemplo Lineal, Ejecutivo, Operativa, Ejecutiva, Multiusos",
    },
    uso: { type: "string", enum: USOS },
    presupuesto_max: { type: "number", description: "Precio máximo por pieza, sin IVA" },
    texto: { type: "string", description: "Parte del nombre del modelo, por ejemplo MESH" },
  },
  [],
  z.object({
    categoria: z.enum(["escritorio", "archivero", "silla"]).optional(),
    subcategoria: z.string().optional(),
    uso: z.enum(USOS as [string, ...string[]]).optional(),
    presupuesto_max: z.number().positive().optional(),
    texto: z.string().optional(),
  }),
  async (i, ctx) => {
    const filtro: Parameters<Repo["buscarProductos"]>[0] = { limite: 3 };
    if (i.categoria) filtro.categoria = i.categoria;
    if (i.subcategoria) filtro.subcategoria = i.subcategoria;
    if (i.uso) filtro.uso = i.uso as (typeof USOS)[number];
    if (i.presupuesto_max) filtro.presupuestoMax = i.presupuesto_max;
    if (i.texto) filtro.texto = i.texto;
    const productos = await ctx.repo.buscarProductos(filtro);
    if (productos.length === 0) {
      return {
        productos: [],
        nota: "Sin coincidencias. Prueba sin presupuesto o con otra categoría. Si el cliente pide algo que no manejamos, escala con fuera_de_inventario.",
      };
    }
    return {
      productos: productos.map((p) => ({
        slug: p.slug,
        nombre: p.nombre,
        precio: formatoPrecio(p.precio),
        disponibilidad: `entrega inmediata, ${STOCK_TEXTO[p.stock]}`,
        para: p.uso,
        ...(p.medidas ? { medidas: p.medidas } : {}),
        ...(p.colores ? { colores: p.colores } : {}),
        tieneFoto: Boolean(p.fotoUrl),
      })),
      nota: "Precios + IVA, vigentes hasta el 31 de diciembre de 2026. Recomienda máximo tres.",
    };
  },
);

const infoEntregaH = herramienta(
  "info_entrega",
  "Reglas de entrega para un municipio o colonia: si entregamos, tiempo estimado, si se puede revisar entrega el mismo día, envío gratis, maniobras y recolección.",
  { municipio: { type: "string", description: "Municipio, colonia o ciudad que dio el cliente" } },
  ["municipio"],
  z.object({ municipio: z.string().min(1) }),
  async (i) => infoEntrega(i.municipio),
);

const registrarLead = herramienta(
  "registrar_lead",
  "Guarda o actualiza datos del cliente y del pedido conforme los da. Manda solo los campos nuevos. También marca avance, marcadores de prioridad, aviso de privacidad enviado y no contactar.",
  {
    nombre: { type: "string" },
    empresa: { type: "string" },
    telefono: { type: "string" },
    producto: { type: "string" },
    cantidad: { type: "integer" },
    color: { type: "string" },
    municipio: { type: "string" },
    direccion: { type: "string" },
    referencias: { type: "string" },
    fecha_deseada: { type: "string" },
    horario_recibir: { type: "string" },
    forma_pago: { type: "string", enum: ["transferencia", "efectivo"] },
    presupuesto: { type: "number" },
    urgencia: { type: "string", enum: URGENCIAS },
    tipo_cliente: { type: "string", enum: TIPOS_CLIENTE },
    comentarios: { type: "string" },
    marcador: { type: "string", enum: MOTIVOS_MARCADOR },
    estado: { type: "string", enum: ESTADOS_LEAD },
    aviso_enviado: { type: "boolean" },
    no_contactar: { type: "boolean" },
  },
  [],
  z.object({
    nombre: z.string().optional(),
    empresa: z.string().optional(),
    telefono: z.string().optional(),
    producto: z.string().optional(),
    cantidad: z.number().int().positive().optional(),
    color: z.string().optional(),
    municipio: z.string().optional(),
    direccion: z.string().optional(),
    referencias: z.string().optional(),
    fecha_deseada: z.string().optional(),
    horario_recibir: z.string().optional(),
    forma_pago: z.enum(["transferencia", "efectivo"]).optional(),
    presupuesto: z.number().positive().optional(),
    urgencia: z.enum(URGENCIAS).optional(),
    tipo_cliente: z.enum(TIPOS_CLIENTE).optional(),
    comentarios: z.string().optional(),
    marcador: z.enum(MOTIVOS_MARCADOR).optional(),
    estado: z.enum(ESTADOS_LEAD).optional(),
    aviso_enviado: z.boolean().optional(),
    no_contactar: z.boolean().optional(),
  }),
  async (i, ctx) => {
    const actual = await ctx.repo.obtenerLead(ctx.conversacion.id);
    const cambios: Partial<Lead> = {};
    const directos = [
      "nombre",
      "empresa",
      "telefono",
      "producto",
      "cantidad",
      "color",
      "municipio",
      "direccion",
      "referencias",
      "presupuesto",
      "urgencia",
      "comentarios",
    ] as const;
    for (const k of directos) {
      const v = i[k];
      if (v === undefined || (typeof v === "string" && v.trim() === "")) continue;
      Object.assign(cambios, { [k]: v });
    }
    if (i.fecha_deseada?.trim()) cambios.fechaDeseada = i.fecha_deseada;
    if (i.horario_recibir?.trim()) cambios.horarioRecibir = i.horario_recibir;
    if (i.forma_pago) cambios.formaPago = i.forma_pago;
    if (i.tipo_cliente) cambios.tipoCliente = i.tipo_cliente;
    if (i.aviso_enviado) cambios.avisoEnviado = true;
    if (i.no_contactar) cambios.noContactar = true;

    const marcadores = new Set(actual.motivosPrioridad);
    if (i.marcador) marcadores.add(i.marcador);
    const cantidad = i.cantidad ?? actual.cantidad;
    if (cantidad !== undefined && cantidad >= 4 && cantidad < 10) marcadores.add("volumen_4");
    if (marcadores.has("factura")) cambios.factura = true;
    if (marcadores.size > actual.motivosPrioridad.length) {
      cambios.motivosPrioridad = [...marcadores];
      cambios.prioritario = true;
    }
    const lead = await ctx.repo.actualizarLead(ctx.conversacion.id, cambios);

    if (i.estado) {
      const conv = await ctx.repo.obtenerConversacion(ctx.conversacion.id);
      if (ORDEN_ESTADO[i.estado] > ORDEN_ESTADO[conv.estado])
        await ctx.repo.actualizarConversacion(conv.id, { estado: i.estado });
    }
    if (i.no_contactar) await ctx.repo.cancelarSeguimientos(ctx.conversacion.id);

    const pistas: string[] = [];
    if (cantidad !== undefined && cantidad >= 10)
      pistas.push("Son 10 piezas o más: llama escalar con motivo volumen_10.");
    return {
      guardado: true,
      avisoEnviado: lead.avisoEnviado,
      marcadores: lead.motivosPrioridad,
      ...(pistas.length ? { pista: pistas.join(" ") } : {}),
    };
  },
  false,
);

const escalar = herramienta(
  "escalar",
  "Pasa la conversación a Bryan López de inmediato. Después de llamarla, despídete en una línea diciendo que Bryan atiende en este mismo chat.",
  {
    motivo: { type: "string", enum: MOTIVOS_PARA_MODELO },
    resumen: {
      type: "string",
      description:
        "Qué pide el cliente, cantidades, zona y cualquier dato útil para Bryan, en una o dos frases",
    },
    urgencia: { type: "string", enum: URGENCIAS },
    tipo_cliente: { type: "string", enum: TIPOS_CLIENTE },
  },
  ["motivo", "resumen", "urgencia", "tipo_cliente"],
  z.object({
    motivo: z.enum(MOTIVOS_PARA_MODELO as [string, ...string[]]),
    resumen: z.string().min(5),
    urgencia: z.enum(URGENCIAS),
    tipo_cliente: z.enum(TIPOS_CLIENTE),
  }),
  async (i, ctx) => {
    ctx.escalacion = {
      motivo: i.motivo,
      resumen: i.resumen,
      urgencia: i.urgencia,
      tipoCliente: i.tipo_cliente,
    };
    return {
      ok: true,
      instruccion: "Despídete en una línea: Bryan López le atiende en este mismo chat. No prometas tiempos.",
    };
  },
);

const enviarFoto = herramienta(
  "enviar_foto",
  "Manda al cliente la foto de un producto antes de tu mensaje. Solo para productos con tieneFoto en true.",
  { slug: { type: "string" } },
  ["slug"],
  z.object({ slug: z.string().min(1) }),
  async (i, ctx) => {
    const p = await ctx.repo.obtenerProducto(i.slug);
    if (!p?.fotoUrl)
      return { ok: false, nota: "Ese producto no tiene foto cargada; ofrece que Bryan la mande." };
    if (ctx.fotos.some((f) => f.url === p.fotoUrl)) return { ok: true };
    ctx.fotos.push({ url: p.fotoUrl, pie: `${p.nombre} · ${formatoPrecio(p.precio)}` });
    return { ok: true };
  },
);

export const HERRAMIENTAS: Herramienta[] = [
  buscarProductos,
  infoEntregaH,
  registrarLead,
  escalar,
  enviarFoto,
];
export const DEFINICIONES: Anthropic.Tool[] = HERRAMIENTAS.map((h) => h.definicion);

export async function ejecutarHerramienta(
  nombre: string,
  input: unknown,
  ctx: ContextoHerramientas,
): Promise<{ contenido: string; esError: boolean }> {
  const h = HERRAMIENTAS.find((x) => x.definicion.name === nombre);
  if (!h) return { contenido: `Herramienta desconocida: ${nombre}`, esError: true };
  const parsed = h.esquema.safeParse(input);
  if (!parsed.success) return { contenido: `Entrada inválida: ${parsed.error.message}`, esError: true };
  try {
    const contenido = JSON.stringify(await h.ejecutar(parsed.data as never, ctx));
    ctx.resultados.push(contenido);
    return { contenido, esError: false };
  } catch (e) {
    return { contenido: `Error al ejecutar ${nombre}: ${(e as Error).message}`, esError: true };
  }
}
