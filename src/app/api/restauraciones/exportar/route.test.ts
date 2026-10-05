import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { status: "activo", user: { role: "ventas" } } as {
    status: string;
    user?: { role: string };
  },
  list: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ getAuthState: async () => mocks.state }));
vi.mock("@/server/restorations/queries", () => ({
  listRestorations: mocks.list,
}));

const { GET } = await import("./route");

const call = (query = "") =>
  GET(new NextRequest(`http://localhost/api/restauraciones/exportar${query}`));

describe("/api/restauraciones/exportar", () => {
  beforeEach(() => {
    mocks.state = { status: "activo", user: { role: "ventas" } };
    mocks.list.mockReset().mockResolvedValue({ items: [], total: 0, pages: 1 });
  });

  it("exige sesión y permiso", async () => {
    mocks.state = { status: "anonimo" };
    expect((await call()).status).toBe(401);
    mocks.state = { status: "activo", user: { role: "logistica" } };
    expect((await call()).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("descarga el CSV con los filtros de la URL, sin paginar", async () => {
    const response = await call("?estado=lista&pagina=3");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toMatch(
      /attachment; filename="restauraciones-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "lista", page: 3 }),
      { all: true },
    );
    expect(await response.text()).toContain("Código,Fecha,Cliente");
  });
});
