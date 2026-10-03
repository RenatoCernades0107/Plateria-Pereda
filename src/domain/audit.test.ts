import { describe, expect, it } from "vitest";

import { describeChanges, entityLabel, formatValue } from "./audit";

describe("describeChanges", () => {
  it("una edición muestra el valor anterior y el nuevo", () => {
    expect(
      describeChanges("talleres", "update", {
        taller: { old: "Taller A", new: "Taller B" },
      }),
    ).toEqual(["Taller: Taller A → Taller B"]);
  });

  it("usa los nombres y formatos de la entidad, en su orden", () => {
    expect(
      describeChanges("profiles", "update", {
        active: { old: true, new: false },
        role: { old: "ventas", new: "logistica" },
      }),
    ).toEqual(["Rol: Ventas → Logística", "Estado: Activo → Desactivado"]);
  });

  it("una creación muestra solo los valores nuevos", () => {
    expect(
      describeChanges("profiles", "insert", {
        full_name: { old: null, new: "Vera Ventas" },
        role: { old: null, new: "admin" },
      }),
    ).toEqual(["Nombre: Vera Ventas", "Rol: Administrador"]);
  });

  it("una eliminación muestra los valores que tenía", () => {
    expect(
      describeChanges("profiles", "delete", {
        email: { old: "a@b.pe", new: null },
      }),
    ).toEqual(["Email: a@b.pe"]);
  });

  it("las columnas desconocidas van al final, ordenadas y con nombre legible", () => {
    expect(
      describeChanges("profiles", "update", {
        zona_horaria: { old: null, new: "Lima" },
        alias: { old: "x", new: "y" },
        full_name: { old: "Ana", new: "Ana María" },
      }),
    ).toEqual([
      "Nombre: Ana → Ana María",
      "Alias: x → y",
      "Zona horaria: — → Lima",
    ]);
  });

  it("un valor vacío se muestra como guion, incluso con formato propio", () => {
    expect(
      describeChanges("profiles", "update", { role: { old: null, new: "x" } }),
    ).toEqual(["Rol: — → x"]);
  });
});

describe("formatValue", () => {
  it.each([
    [null, "—"],
    [undefined, "—"],
    ["", "—"],
    [true, "Sí"],
    [false, "No"],
    [12.5, "12.5"],
    [["a", "b"], "a, b"],
    [[], "—"],
    [{ a: 1 }, '{"a":1}'],
  ])("%j → %s", (value, texto) => {
    expect(formatValue(value)).toBe(texto);
  });
});

describe("entityLabel", () => {
  it("usa el nombre de la entidad o uno legible", () => {
    expect(entityLabel("profiles")).toBe("Usuario");
    expect(entityLabel("piezas_taller")).toBe("Piezas taller");
  });
});
