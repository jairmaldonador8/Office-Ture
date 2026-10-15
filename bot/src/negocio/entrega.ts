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

const ALIAS = MUNICIPIOS.flatMap((m) => m.alias.map((a) => ({ alias: a, m })));

// Nombres que también existen como municipio, colonia o calle en otros estados.
const AMBIGUOS = new Set(["Juárez", "Santiago", "Guadalupe", "García", "Allende", "Hidalgo", "Galeana"]);

// Los otros 31 estados (y algunos países), normalizados. Solo descartan municipios ambiguos.
const FUERA_DE_NL = [
  "aguascalientes",
  "baja california sur",
  "baja california",
  "campeche",
  "chiapas",
  "chihuahua",
  "ciudad de mexico",
  "cdmx",
  "coahuila",
  "colima",
  "durango",
  "estado de mexico",
  "edomex",
  "guanajuato",
  "guerrero",
  "hidalgo",
  "jalisco",
  "michoacan",
  "morelos",
  "nayarit",
  "oaxaca",
  "puebla",
  "queretaro",
  "quintana roo",
  "san luis potosi",
  "sinaloa",
  "sonora",
  "tabasco",
  "tamaulipas",
  "tlaxcala",
  "veracruz",
  "yucatan",
  "zacatecas",
  "estados unidos",
  "usa",
  "texas",
  "colombia",
  "espana",
].map((e) => ` ${e} `);

const NUEVO_LEON = [" nuevo leon ", " n l ", " nl "];

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

// El municipio suele ir al final de la dirección: gana el match que termina más tarde;
// a igual final, el alias más largo («san nicolas» sobre «nicolas»).
function municipioFinal(texto: string): Municipio | undefined {
  let mejor: { fin: number; largo: number; m: Municipio } | undefined;
  for (const { alias, m } of ALIAS) {
    const clave = ` ${alias} `;
    for (let i = texto.indexOf(clave); i !== -1; i = texto.indexOf(clave, i + 1)) {
      const fin = i + clave.length;
      if (!mejor || fin > mejor.fin || (fin === mejor.fin && alias.length > mejor.largo)) {
        mejor = { fin, largo: alias.length, m };
      }
    }
  }
  return mejor?.m;
}

function fueraDeNuevoLeon(texto: string, m: Municipio): boolean {
  if (!AMBIGUOS.has(m.nombre) || NUEVO_LEON.some((n) => texto.includes(n))) return false;
  if (m.nombre === "Hidalgo") return texto.trim() !== "hidalgo";
  return FUERA_DE_NL.some((e) => texto.includes(e));
}

export function infoEntrega(lugar: string): InfoEntrega {
  const texto = normalizar(lugar);
  const hallado = municipioFinal(texto);
  const comun = { maniobras: MANIOBRAS, recoleccion: RECOLECCION };
  if (!hallado || fueraDeNuevoLeon(texto, hallado)) {
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
