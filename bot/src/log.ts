/** Oculta números largos (teléfonos, ids): deja «…» y los últimos 4 dígitos de cada serie de 7 o más. */
export const enmascarar = (texto: string): string => texto.replace(/\d{7,}/g, (n) => `…${n.slice(-4)}`);

/** Mensaje de un error, sin datos personales, listo para console.*. */
export const errorSeguro = (e: unknown): string => enmascarar(e instanceof Error ? e.message : String(e));

/** Teléfono o IGSID con solo los últimos 4 caracteres visibles, para los registros. */
export const enmascararId = (id: string): string => `***${id.slice(-4)}`;
