import type { Canal, ReferenciaAnuncio } from "../canales/tipos.js";
import type { Lead } from "../datos/tipos.js";
import { describirLocal, enHorario } from "../hora.js";
import { ESCALAR, FLUJO, identidad, NEGOCIO, OBJECIONES, reglas, TONO } from "./conocimiento.js";

/** Bloque que no cambia entre turnos: va antes del punto de caché. */
export function sistemaEstatico(o: { nombre: string; avisoUrl: string }): string {
  return [identidad(o.nombre), TONO, reglas(o.avisoUrl), FLUJO, ESCALAR, NEGOCIO, OBJECIONES].join("\n\n");
}

/** Campos del lead que le sirven a Claude; omite banderas internas y vacíos. */
function leadCompacto(l: Lead): Record<string, unknown> {
  const {
    conversacionId: _,
    prioritario: __,
    motivosPrioridad,
    escaladoSinAtender: ___,
    avisoEnviado: ____,
    noContactar: _____,
    ...resto
  } = l;
  const salida: Record<string, unknown> = Object.fromEntries(
    Object.entries(resto).filter(([, v]) => v !== undefined && v !== ""),
  );
  if (motivosPrioridad.length) salida.marcadores = motivosPrioridad;
  return salida;
}

/** Bloque que cambia en cada turno: va después del punto de caché. */
export function sistemaDinamico(o: {
  canal: Canal;
  ahora: Date;
  referencia?: ReferenciaAnuncio;
  resumenHilo?: string;
  lead: Lead;
  primerMensajeBot: boolean;
  nombreCliente?: string;
}): string {
  const lineas = [
    "<contexto>",
    `Canal: ${o.canal}`,
    `Fecha y hora en Monterrey: ${describirLocal(o.ahora)}. Dentro de horario de atención: ${enHorario(o.ahora) ? "sí" : "no (Bryan confirma al abrir)"}.`,
  ];
  if (o.nombreCliente) lineas.push(`Nombre de perfil del cliente: ${o.nombreCliente}`);
  if (o.referencia?.titulo || o.referencia?.cuerpo) {
    lineas.push(
      `Anuncio de origen: «${o.referencia.titulo ?? ""}»${o.referencia.cuerpo ? ` — «${o.referencia.cuerpo}»` : ""}`,
    );
  }
  if (o.resumenHilo) lineas.push(`Resumen de la conversación anterior: ${o.resumenHilo}`);
  lineas.push(`Datos del cliente hasta ahora: ${JSON.stringify(leadCompacto(o.lead))}`);
  lineas.push(`Aviso de privacidad enviado: ${o.lead.avisoEnviado ? "sí" : "no"}`);
  lineas.push(`Es tu primer mensaje en esta conversación: ${o.primerMensajeBot ? "sí" : "no"}`);
  lineas.push("</contexto>");
  return lineas.join("\n");
}
