import { describe, expect, it } from "vitest";
import { sincronizarInventario } from "../../src/flujo/inventario.js";
import { depsDePrueba } from "./apoyo.js";

const ENCABEZADO = [
  "Categoria",
  "Subcategoria",
  "Producto",
  "Precio_MXN",
  "IVA",
  "Precio_Publico",
  "Disponibilidad",
  "Stock",
  "Prioridad_Venta",
  "Respuesta_Chatbot_Base",
];
const LITE = [
  "Sillas",
  "Operativa",
  "Silla LITE",
  "$1,490",
  "",
  "",
  "",
  "Disponible con proveedor",
  "Alta",
  "",
];
const hoja = [ENCABEZADO, LITE];
const leer = (filas: string[][]) => async () => filas;

describe("sincronizarInventario", () => {
  it("carga productos y reinicia el contador de fallos", async () => {
    const { deps, repo } = depsDePrueba();
    await repo.escribirMarca("fallos_inventario", "2");
    expect(await sincronizarInventario(deps, leer(hoja))).toMatchObject({ activos: 1, desactivados: 0 });
    expect(await repo.leerMarca("fallos_inventario")).toBe("0");
    expect((await repo.obtenerProducto("silla-lite"))?.precio).toBe(1490);
  });

  it("desactiva los productos que ya no vienen en la hoja", async () => {
    const { deps, repo } = depsDePrueba();
    const otra = ["Sillas", "Ejecutiva", "Silla Roma", "$3,200", "", "", "", "Stock alto", "Media", ""];
    await sincronizarInventario(deps, leer([ENCABEZADO, LITE, otra]));
    expect(await sincronizarInventario(deps, leer(hoja))).toMatchObject({ activos: 1, desactivados: 1 });
    expect((await repo.obtenerProducto("silla-roma"))?.activo).toBe(false);
  });

  it("una hoja vacía no desactiva el inventario", async () => {
    const { deps, repo } = depsDePrueba();
    await sincronizarInventario(deps, leer(hoja));
    const r = await sincronizarInventario(deps, leer([ENCABEZADO]));
    expect(r).toHaveProperty("fallo");
    expect((await repo.buscarProductos({})).length).toBe(1);
  });

  it("una lectura sin filas o sin columnas obligatorias cuenta como fallo", async () => {
    const { deps, repo } = depsDePrueba();
    await sincronizarInventario(deps, leer(hoja));
    expect(await sincronizarInventario(deps, leer([]))).toHaveProperty("fallo");
    const r = await sincronizarInventario(
      deps,
      leer([
        ["Producto", "Precio"],
        ["Silla", "1"],
      ]),
    );
    expect(r).toMatchObject({ fallo: expect.stringContaining("Faltan columnas") });
    expect(await repo.leerMarca("fallos_inventario")).toBe("2");
    expect((await repo.obtenerProducto("silla-lite"))?.activo).toBe(true);
  });

  it("al tercer fallo seguido avisa una vez", async () => {
    const correos: string[] = [];
    const { deps } = depsDePrueba({
      correo: async (_, t) => {
        correos.push(t);
      },
    });
    const falla = async (): Promise<string[][]> => {
      throw new Error("403 sin permiso");
    };
    for (let i = 0; i < 4; i++) await sincronizarInventario(deps, falla);
    expect(correos).toHaveLength(1);
    expect(correos[0]).toContain("403 sin permiso");
  });

  it("sin correo configurado, el aviso de falla va por WhatsApp al dueño principal", async () => {
    const { deps, wa } = depsDePrueba();
    const falla = async (): Promise<string[][]> => {
      throw new Error("403 sin permiso");
    };
    for (let i = 0; i < 3; i++) await sincronizarInventario(deps, falla);
    expect(wa.enviados.map((e) => [e.para, e.plantilla])).toEqual([["5218111111111", "alerta_bryan"]]);
  });

  it("avisa de filas con errores una sola vez mientras no cambien; los «Aviso:» no se mandan", async () => {
    const correos: string[] = [];
    const { deps } = depsDePrueba({
      correo: async (_, t) => {
        correos.push(t);
      },
    });
    const malPrecio = [
      "Sillas",
      "Operativa",
      "Silla Mala",
      "consultar",
      "",
      "",
      "",
      "Stock alto",
      "Alta",
      "",
    ];
    const sinPrioridad = ["Sillas", "Operativa", "Silla Rara", "$900", "", "", "", "Stock alto", "?", ""];

    const r = await sincronizarInventario(deps, leer([ENCABEZADO, LITE, malPrecio, sinPrioridad]));
    expect(r).toMatchObject({ activos: 2 });
    expect(correos).toHaveLength(1);
    expect(correos[0]).toContain("Silla Mala");
    expect(correos[0]).not.toContain("Silla Rara");

    await sincronizarInventario(deps, leer([ENCABEZADO, LITE, malPrecio, sinPrioridad]));
    expect(correos).toHaveLength(1);

    // Se corrige: no hay aviso; si vuelve a fallar, se avisa de nuevo.
    await sincronizarInventario(deps, leer([ENCABEZADO, LITE, sinPrioridad]));
    expect(correos).toHaveLength(1);
    await sincronizarInventario(deps, leer([ENCABEZADO, LITE, malPrecio]));
    expect(correos).toHaveLength(2);
  });

  it("solo avisos: no se manda nada", async () => {
    const correos: string[] = [];
    const { deps } = depsDePrueba({
      correo: async (_, t) => {
        correos.push(t);
      },
    });
    const sinPrioridad = ["Sillas", "Operativa", "Silla Rara", "$900", "", "", "", "Stock alto", "?", ""];
    const r = await sincronizarInventario(deps, leer([ENCABEZADO, LITE, sinPrioridad]));
    expect(r).toMatchObject({ activos: 2, errores: [expect.stringContaining("Aviso:")] });
    expect(correos).toEqual([]);
  });

  describe("con una hoja recortada", () => {
    const fila = (n: number) => [
      "Sillas",
      "Operativa",
      `Silla ${n}`,
      "$1,000",
      "",
      "",
      "",
      "Stock alto",
      "Alta",
      "",
    ];
    const hojaDe = (n: number) => [ENCABEZADO, ...Array.from({ length: n }, (_, i) => fila(i + 1))];

    it("con menos de la mitad de los activos no toca el catálogo y avisa de inmediato, una vez", async () => {
      const correos: string[] = [];
      const { deps, repo } = depsDePrueba({
        correo: async (_, t) => {
          correos.push(t);
        },
      });
      await sincronizarInventario(deps, leer(hojaDe(10)));
      expect(await repo.contarProductosActivos()).toBe(10);
      let llamadas = 0;
      const original = repo.sincronizarProductos.bind(repo);
      repo.sincronizarProductos = async (ps) => {
        llamadas++;
        return original(ps);
      };

      const r = await sincronizarInventario(deps, leer(hojaDe(4)));
      expect(r).toHaveProperty("fallo");
      expect(llamadas).toBe(0);
      expect(await repo.contarProductosActivos()).toBe(10);
      expect(await repo.leerMarca("fallos_inventario")).toBe("1");
      expect(correos).toEqual([
        "La hoja tiene 4 productos válidos de 10 activos; no actualicé el catálogo. Revisa la hoja.",
      ]);

      // Mientras siga igual no se repite, ni siquiera al tercer fallo.
      await sincronizarInventario(deps, leer(hojaDe(4)));
      await sincronizarInventario(deps, leer(hojaDe(4)));
      expect(correos).toHaveLength(1);

      // Se arregla y después vuelve a romperse: se avisa otra vez.
      await sincronizarInventario(deps, leer(hojaDe(10)));
      expect(await repo.leerMarca("fallos_inventario")).toBe("0");
      await sincronizarInventario(deps, leer(hojaDe(4)));
      expect(correos).toHaveLength(2);
    });

    it("con la mitad o más se aplica como siempre", async () => {
      const { deps, repo } = depsDePrueba();
      await sincronizarInventario(deps, leer(hojaDe(10)));
      expect(await sincronizarInventario(deps, leer(hojaDe(5)))).toMatchObject({
        activos: 5,
        desactivados: 5,
      });
      expect(await repo.contarProductosActivos()).toBe(5);
    });

    it("con el catálogo vacío no aplica la protección", async () => {
      const { deps } = depsDePrueba();
      expect(await sincronizarInventario(deps, leer(hojaDe(1)))).toMatchObject({ activos: 1 });
    });
  });

  it("si las marcas fallan al registrar un fallo, no lanza", async () => {
    const { deps, repo } = depsDePrueba();
    repo.leerMarca = async () => {
      throw new Error("base caída");
    };
    repo.escribirMarca = async () => {
      throw new Error("base caída");
    };
    const falla = async (): Promise<string[][]> => {
      throw new Error("403 sin permiso");
    };
    await expect(sincronizarInventario(deps, falla)).resolves.toEqual({ fallo: "403 sin permiso" });
  });
});
