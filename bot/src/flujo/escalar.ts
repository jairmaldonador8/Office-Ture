import { esFueraDeVentana } from "../canales/tipos.js";
import type { Escalacion } from "../cerebro/herramientas.js";
import { duenos, ultimos10 } from "../config.js";
import type { Contacto, Lead } from "../datos/tipos.js";
import { enHorario, horas, siguienteDiaHabilA } from "../hora.js";
import type { Deps } from "./deps.js";
import { etiquetaMotivo } from "./motivos.js";

const SIN_CAMBIO_DE_ESTADO = new Set(["proveedor", "error_modelo"]);

/** Cómo se identifica al cliente en alertas y comandos: 10 dígitos en WhatsApp, @usuario en Instagram. */
export function referenciaCliente(c: Contacto): string {
  if (c.canal === "whatsapp") return ultimos10(c.telefono ?? c.idExterno);
  return c.usuario ? `@${c.usuario}` : c.idExterno;
}

export function textoAlerta(o: { motivo: string; contacto: Contacto; lead: Lead; resumen: string }): string {
  const ref = referenciaCliente(o.contacto);
  const datos = [
    o.lead.producto ? `Producto: ${o.lead.producto}` : "",
    o.lead.cantidad ? `Cantidad: ${o.lead.cantidad}` : "",
    o.lead.municipio ? `Zona: ${o.lead.municipio}` : "",
    o.lead.factura ? "Requiere factura" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return [
    `OfficeTure · ${etiquetaMotivo(o.motivo)}`,
    `Cliente: ${o.contacto.nombre ?? "sin nombre"} · ${ref} (${o.contacto.canal === "whatsapp" ? "WhatsApp" : "Instagram"})`,
    datos,
    o.resumen,
    `Contéstale en su chat desde tu app. Al terminar: /ganado ${ref} o /perdido ${ref} motivo. Para regresarle el asistente: /bot ${ref}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Las variables de plantilla no admiten saltos de línea ni más de 4 espacios seguidos. */
const variable = (s: string): string =>
  s
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\s{4,}/g, "   ")
    .slice(0, 900) || "-";

/**
 * Manda un mensaje a un dueño: texto libre si escribió en las últimas 24 h, plantilla alerta_bryan si no.
 * Si Meta rechaza el texto por ventana cerrada (el registro local puede ir atrasado), reintenta con la plantilla.
 * Nunca lanza: devuelve el id del mensaje o undefined si no salió.
 */
export async function enviarADueno(
  telefono: string,
  texto: string,
  variablesPlantilla: string[],
  d: Deps,
): Promise<string | undefined> {
  const wa = d.enviadores.whatsapp;
  const plantilla = () => wa.plantilla(telefono, "alerta_bryan", variablesPlantilla.map(variable));
  try {
    const ventana = await d.repo.ventanaDueno(telefono);
    const abierta = ventana !== null && d.ahora().getTime() - ventana.getTime() < horas(24);
    if (!abierta) return await plantilla();
    try {
      return await wa.texto(telefono, texto);
    } catch (e) {
      if (!esFueraDeVentana(e)) throw e;
      return await plantilla();
    }
  } catch (e) {
    console.error("alerta a dueño", telefono, e);
    return undefined;
  }
}

export async function ejecutarEscalacion(conversacionId: string, esc: Escalacion, d: Deps): Promise<void> {
  const ahora = d.ahora();
  const conv = await d.repo.obtenerConversacion(conversacionId);
  const contacto = await d.repo.obtenerContacto(conv.contactoId);
  const lead = await d.repo.actualizarLead(conversacionId, {
    motivoEscalacion: esc.motivo,
    resumen: esc.resumen,
    urgencia: esc.urgencia,
    tipoCliente: esc.tipoCliente,
  });
  const dentro = enHorario(ahora);
  await d.repo.actualizarConversacion(conversacionId, {
    modo: "esperando_humano",
    modoHasta: dentro ? new Date(ahora.getTime() + horas(2)) : siguienteDiaHabilA(ahora, 11),
    motivoModo: esc.motivo,
    avisoEsperaEnviado: false,
    ...(SIN_CAMBIO_DE_ESTADO.has(esc.motivo) ? {} : { estado: "transferido" as const }),
  });
  await d.repo.cancelarSeguimientos(conversacionId);

  const [principal] = duenos(d.config);
  if (!principal) return;
  const texto = textoAlerta({ motivo: esc.motivo, contacto, lead, resumen: esc.resumen });
  const idExterno = await enviarADueno(
    principal.telefono,
    texto,
    [
      etiquetaMotivo(esc.motivo),
      `${contacto.nombre ?? "Sin nombre"} (${referenciaCliente(contacto)})`,
      esc.resumen,
    ],
    d,
  );
  await d.repo.crearAlerta({
    conversacionId,
    motivo: esc.motivo,
    texto,
    enviadaA: principal.telefono,
    ...(idExterno ? { idExterno } : {}),
    enviadaEn: ahora,
    reintentos: 0,
    diferida: !dentro,
  });
  if (d.correo) {
    try {
      await d.correo(`OfficeTure · ${etiquetaMotivo(esc.motivo)}`, texto);
    } catch (e) {
      console.error("correo de alerta", e);
    }
  }
}
