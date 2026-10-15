import type { Canal } from "../canales/tipos.js";
import { ajustarVentanaToques, horas, proximaA } from "../hora.js";

export interface EstadoSeguimiento {
  canal: Canal;
  modo: "bot" | "esperando_humano" | "humano" | "pausado";
  estado: string;
  toques: number;
  noContactar: boolean;
  ultimoCliente: Date;
  ultimoBot: Date;
  ventanaGratisHasta?: Date;
}

export interface Toque {
  tipo: "toque1" | "toque2" | "cierre";
  programadoPara: Date;
  usarPlantilla: boolean;
}

const ESTADOS_CON_SEGUIMIENTO = new Set(["nuevo", "calificado", "cotizado"]);

export function siguienteToque(s: EstadoSeguimiento): Toque | null {
  if (s.modo !== "bot" || s.noContactar || !ESTADOS_CON_SEGUIMIENTO.has(s.estado)) return null;
  const cierraVentana24 = s.ultimoCliente.getTime() + horas(24);

  if (s.toques === 0) {
    const cuando = ajustarVentanaToques(new Date(s.ultimoBot.getTime() + horas(3)));
    if (cuando.getTime() < cierraVentana24)
      return { tipo: "toque1", programadoPara: cuando, usarPlantilla: false };
    // La ventana se cerraría: se salta al toque 2.
    return siguienteToque({ ...s, toques: 1 });
  }

  if (s.toques === 1) {
    const cuando = proximaA(new Date(s.ultimoBot.getTime() + horas(12)), 10);
    const dentro24 = cuando.getTime() < cierraVentana24;
    const dentroGratis =
      s.ventanaGratisHasta !== undefined && cuando.getTime() < s.ventanaGratisHasta.getTime();
    if (s.canal === "instagram" && !dentro24) {
      return { tipo: "cierre", programadoPara: cuando, usarPlantilla: false };
    }
    return { tipo: "toque2", programadoPara: cuando, usarPlantilla: !dentro24 && !dentroGratis };
  }

  return {
    tipo: "cierre",
    programadoPara: new Date(s.ultimoBot.getTime() + horas(24)),
    usarPlantilla: false,
  };
}
