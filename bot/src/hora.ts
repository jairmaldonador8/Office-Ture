/** Monterrey: UTC-6 todo el año desde 2022. */
const OFFSET_H = -6;
const HORA_MS = 3_600_000;

export interface Local {
  dia: number; // 0 domingo … 6 sábado
  hora: number; // decimal, 10.5 = 10:30
  anio: number;
  mes: number; // 0-11
  fecha: number;
}

export function local(d: Date): Local {
  const t = new Date(d.getTime() + OFFSET_H * HORA_MS);
  return {
    dia: t.getUTCDay(),
    hora: t.getUTCHours() + t.getUTCMinutes() / 60,
    anio: t.getUTCFullYear(),
    mes: t.getUTCMonth(),
    fecha: t.getUTCDate(),
  };
}

export function aLocal(anio: number, mes: number, fecha: number, hora: number, minuto = 0): Date {
  return new Date(Date.UTC(anio, mes, fecha, hora - OFFSET_H, minuto));
}

/** Lunes a viernes 9 a 19, sábado 10 a 19. Pendiente de confirmar con el cliente. */
export function enHorario(d: Date): boolean {
  const l = local(d);
  if (l.dia === 0) return false;
  const abre = l.dia === 6 ? 10 : 9;
  return l.hora >= abre && l.hora < 19;
}

/** Día hábil = lunes a sábado. Devuelve el siguiente día hábil (después de hoy) a la hora dada. */
export function siguienteDiaHabilA(d: Date, hora: number): Date {
  const l = local(d);
  let candidato = aLocal(l.anio, l.mes, l.fecha + 1, hora);
  while (local(candidato).dia === 0) {
    const c = local(candidato);
    candidato = aLocal(c.anio, c.mes, c.fecha + 1, hora);
  }
  return candidato;
}

/** Hoy a la hora dada si aún no pasa; si no, mañana a esa hora. */
export function proximaA(d: Date, hora: number): Date {
  const l = local(d);
  const hoy = aLocal(l.anio, l.mes, l.fecha, hora);
  return hoy.getTime() > d.getTime() ? hoy : aLocal(l.anio, l.mes, l.fecha + 1, hora);
}

/** Los seguimientos solo salen de 9:00 a 20:00 hora local. */
export function ajustarVentanaToques(d: Date): Date {
  const l = local(d);
  if (l.hora >= 9 && l.hora < 20) return d;
  return l.hora < 9 ? aLocal(l.anio, l.mes, l.fecha, 9) : aLocal(l.anio, l.mes, l.fecha + 1, 9);
}

export const horas = (n: number): number => n * HORA_MS;

export function describirLocal(d: Date): string {
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const l = local(d);
  const hh = Math.floor(l.hora).toString().padStart(2, "0");
  const mm = Math.round((l.hora % 1) * 60)
    .toString()
    .padStart(2, "0");
  return `${dias[l.dia]} ${l.fecha} de ${meses[l.mes]}, ${hh}:${mm}`;
}
