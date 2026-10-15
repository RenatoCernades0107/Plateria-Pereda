import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      mocks.from(table);
      return {
        select: (columns: string) => {
          mocks.select(columns);
          return { eq: () => ({ maybeSingle: mocks.maybeSingle }) };
        },
      };
    },
  }),
}));

const { recordMetadata } = await import("./page-titles");

const ID = "0b9c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d";

describe("recordMetadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa el código de la restauración como título", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { code: "RES-00012" } });
    await expect(
      recordMetadata("restoration", ID, "Restauración"),
    ).resolves.toEqual({ title: "RES-00012" });
    expect(mocks.from).toHaveBeenCalledWith("restorations");
    expect(mocks.select).toHaveBeenCalledWith("code");
  });

  it("arma el título del taller con su nombre", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { name: "Taller Sur" } });
    await expect(
      recordMetadata("workshop", ID, "Piezas del taller"),
    ).resolves.toEqual({ title: "Piezas de Taller Sur" });
  });

  it("vuelve al genérico sin registro, sin código o con un id inválido", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    await expect(recordMetadata("piece", ID, "Pieza")).resolves.toEqual({
      title: "Pieza",
    });
    mocks.maybeSingle.mockResolvedValue({ data: { code: null } });
    await expect(recordMetadata("quote", ID, "Cotización")).resolves.toEqual({
      title: "Cotización",
    });
    await expect(recordMetadata("client", "x", "Cliente")).resolves.toEqual({
      title: "Cliente",
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});
