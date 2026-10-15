export interface InfoEntrega {
  municipio: string | null;
  entregamos: boolean;
  mismoDiaPosible: boolean;
  tiempo: string;
  envioGratisDesde: number | null;
  maniobras: string;
  recoleccion: string;
  nota: string;
}

interface Municipio {
  nombre: string;
  alias: string[];
  metro: boolean;
  mismoDia: boolean;
}

// Fuente: cerebro de Tadeo. «metro» (entrega al día siguiente) es suposición nuestra, validar con Bryan.
const MUNICIPIOS: Municipio[] = [
  { nombre: "San Nicolás", alias: ["san nicolas de los garza", "san nicolas"], metro: true, mismoDia: true },
  { nombre: "Apodaca", alias: ["apodaca"], metro: true, mismoDia: true },
  {
    nombre: "Escobedo",
    alias: ["general escobedo", "gral escobedo", "escobedo"],
    metro: true,
    mismoDia: true,
  },
  { nombre: "Monterrey", alias: ["monterrey", "mty"], metro: true, mismoDia: true },
  { nombre: "Guadalupe", alias: ["guadalupe"], metro: true, mismoDia: true },
  { nombre: "San Pedro", alias: ["san pedro garza garcia", "san pedro"], metro: true, mismoDia: false },
  { nombre: "Juárez", alias: ["juarez"], metro: true, mismoDia: false },
  { nombre: "Santa Catarina", alias: ["santa catarina"], metro: true, mismoDia: false },
  { nombre: "García", alias: ["garcia"], metro: true, mismoDia: false },
  { nombre: "Cadereyta", alias: ["cadereyta jimenez", "cadereyta"], metro: false, mismoDia: false },
  { nombre: "El Carmen", alias: ["el carmen"], metro: false, mismoDia: false },
  { nombre: "Salinas Victoria", alias: ["salinas victoria"], metro: false, mismoDia: false },
  { nombre: "Ciénega de Flores", alias: ["cienega de flores"], metro: false, mismoDia: false },
  { nombre: "Pesquería", alias: ["pesqueria"], metro: false, mismoDia: false },
  { nombre: "Santiago", alias: ["santiago"], metro: false, mismoDia: false },
  { nombre: "Allende", alias: ["allende"], metro: false, mismoDia: false },
  { nombre: "Montemorelos", alias: ["montemorelos"], metro: false, mismoDia: false },
  { nombre: "General Terán", alias: ["general teran", "gral teran"], metro: false, mismoDia: false },
  { nombre: "Saltillo", alias: ["saltillo"], metro: false, mismoDia: false },
  { nombre: "Ramos Arizpe", alias: ["ramos arizpe"], metro: false, mismoDia: false },
  { nombre: "Galeana", alias: ["galeana"], metro: false, mismoDia: false },
  { nombre: "Hidalgo", alias: ["hidalgo"], metro: false, mismoDia: false },
  {
    nombre: "General Zuazua",
    alias: ["general zuazua", "gral zuazua", "zuazua"],
    metro: false,
    mismoDia: false,
  },
  { nombre: "Marín", alias: ["marin"], metro: false, mismoDia: false },
];

// Alias más largos primero: «san pedro garza garcia» gana sobre «garcia».
const ALIAS = MUNICIPIOS.flatMap((m) => m.alias.map((a) => ({ alias: a, m }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

const normalizar = (s: string): string =>
  ` ${s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

const MANIOBRAS =
  "Subir a planta alta tiene costo de $200 a $500 por maniobras; escaleras de caracol o acceso difícil lo revisa Bryan.";
const RECOLECCION =
  "Puede recoger en bodega (Sierra Madre del Sur 413, Col. Vicente Guerrero) con pedido un día antes o el mismo día con 3 horas de anticipación.";

export function infoEntrega(lugar: string): InfoEntrega {
  const texto = normalizar(lugar);
  const hallado = ALIAS.find(({ alias }) => texto.includes(` ${alias} `))?.m;
  const comun = { maniobras: MANIOBRAS, recoleccion: RECOLECCION };
  if (!hallado) {
    return {
      municipio: null,
      entregamos: false,
      mismoDiaPosible: false,
      tiempo: "",
      envioGratisDesde: null,
      nota: "Municipio fuera de las zonas de entrega o no reconocido. Escalar con motivo fuera_de_zona si el cliente confirma el lugar.",
      ...comun,
    };
  }
  return {
    municipio: hallado.nombre,
    entregamos: true,
    mismoDiaPosible: hallado.mismoDia,
    tiempo: hallado.metro
      ? "Con inventario y ruta disponible, puede ser al día siguiente del pedido."
      : "Se programa ruta; normalmente de 2 a 3 días según producto y cantidad.",
    envioGratisDesde: hallado.mismoDia ? 40000 : null,
    nota: "El costo de envío no está incluido: se calcula según distancia, cantidad y maniobras, y lo confirma Bryan.",
    ...comun,
  };
}
