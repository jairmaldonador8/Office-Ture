import { JWT } from "google-auth-library";
// Solo el módulo de Sheets: el índice de googleapis carga los ~300 servicios y alarga el arranque en frío.
import { sheets, type sheets_v4 } from "googleapis/build/src/apis/sheets/index.js";

const ALCANCE = "https://www.googleapis.com/auth/spreadsheets.readonly";

/** Rango A1 de una pestaña completa; el nombre va entre comillas simples por si trae espacios. */
export const rangoPestana = (pestana: string): string => `'${pestana.replace(/'/g, "''")}'`;

/**
 * Lector de la hoja de inventario con cuenta de servicio (la hoja se comparte con su
 * `client_email` como lector). Devuelve los valores formateados, tal como se ven en la
 * hoja, que es lo que espera `mapearHoja`. El cliente se arma una vez y se reutiliza.
 */
export function lectorHoja(saJson: string, hojaId: string, pestana: string): () => Promise<string[][]> {
  let cliente: sheets_v4.Sheets | undefined;
  return async () => {
    if (!cliente) {
      if (!saJson) throw new Error("Falta GOOGLE_SA_JSON");
      let cred: { client_email?: string; private_key?: string };
      try {
        cred = JSON.parse(saJson) as typeof cred;
      } catch {
        throw new Error("GOOGLE_SA_JSON no es JSON válido");
      }
      if (!cred.client_email || !cred.private_key) {
        throw new Error("GOOGLE_SA_JSON no trae client_email y private_key");
      }
      const auth = new JWT({ email: cred.client_email, key: cred.private_key, scopes: [ALCANCE] });
      cliente = sheets({ version: "v4", auth });
    }
    const r = await cliente.spreadsheets.values.get(
      {
        spreadsheetId: hojaId,
        range: rangoPestana(pestana),
        valueRenderOption: "FORMATTED_VALUE",
        majorDimension: "ROWS",
      },
      { timeout: 20_000 },
    );
    return (r.data.values ?? []).map((fila) => fila.map((v) => (v == null ? "" : String(v))));
  };
}
