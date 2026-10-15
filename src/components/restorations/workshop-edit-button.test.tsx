import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PieceWorkshopField, WorkshopEditButton } from "./workshop-edit-button";

vi.mock("@/server/restorations/status-actions", () => ({
  assignWorkshop: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const workshops = [
  { id: "w1", name: "Taller Central" },
  { id: "w2", name: "Taller Norte" },
];

const piece = {
  id: "p1",
  code: "RES-00001-1",
  status: "aprobada" as const,
  workshopId: "w2",
  workshopName: "Taller Norte",
};

beforeEach(async () => {
  const { assignWorkshop } =
    await import("@/server/restorations/status-actions");
  vi.mocked(assignWorkshop).mockReset();
  vi.mocked(assignWorkshop).mockResolvedValue({ ok: true });
});

describe("WorkshopEditButton", () => {
  it("cambia el taller ya asignado", async () => {
    const { assignWorkshop } =
      await import("@/server/restorations/status-actions");
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<WorkshopEditButton piece={piece} workshops={workshops} />);
    await user.click(
      screen.getByRole("button", { name: "Cambiar taller de RES-00001-1" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Taller de RES-00001-1",
    });
    const select = within(dialog).getByRole("combobox", { name: "Taller" });
    // Parte del taller que ya tiene la pieza.
    expect(select).toHaveTextContent("Taller Norte");
    const save = within(dialog).getByRole("button", { name: "Guardar taller" });
    expect(save).toBeDisabled();
    await user.click(select);
    await user.click(
      await screen.findByRole("option", { name: "Taller Central" }),
    );
    await user.click(save);
    expect(assignWorkshop).toHaveBeenCalledWith(null, ["p1"], "w1");
    expect(toast.success).toHaveBeenCalledWith(
      "Taller de RES-00001-1 actualizado.",
    );
  });

  it("puede dejar la pieza sin taller", async () => {
    const { assignWorkshop } =
      await import("@/server/restorations/status-actions");
    const user = userEvent.setup();
    render(<WorkshopEditButton piece={piece} workshops={workshops} />);
    await user.click(
      screen.getByRole("button", { name: "Cambiar taller de RES-00001-1" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Taller" }));
    await user.click(await screen.findByRole("option", { name: "Sin taller" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar taller" }),
    );
    expect(assignWorkshop).toHaveBeenCalledWith(null, ["p1"], null);
  });

  it("sin taller el lápiz dice «Asignar taller» y avisa el error del servidor", async () => {
    const { assignWorkshop } =
      await import("@/server/restorations/status-actions");
    const { toast } = await import("sonner");
    vi.mocked(assignWorkshop).mockResolvedValue({ error: "Sin permiso." });
    const user = userEvent.setup();
    render(
      <WorkshopEditButton
        piece={{ ...piece, workshopId: null, workshopName: null }}
        workshops={workshops}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Asignar taller de RES-00001-1" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Taller" }));
    await user.click(
      await screen.findByRole("option", { name: "Taller Central" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar taller" }),
    );
    expect(toast.error).toHaveBeenCalledWith("Sin permiso.");
    // El diálogo sigue abierto para reintentar.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("muestra el taller actual aunque ya no esté activo", async () => {
    const user = userEvent.setup();
    render(
      <WorkshopEditButton
        piece={{ ...piece, workshopId: "w9", workshopName: "Taller Antiguo" }}
        workshops={workshops}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Cambiar taller de RES-00001-1" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("combobox", { name: "Taller" }),
    ).toHaveTextContent("Taller Antiguo");
  });
});

describe("PieceWorkshopField", () => {
  it("con permiso muestra el nombre y el lápiz", () => {
    render(
      <PieceWorkshopField piece={piece} workshops={workshops} canAssign />,
    );
    expect(screen.getByText("Taller Norte")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cambiar taller de RES-00001-1" }),
    ).toBeInTheDocument();
  });

  it("sin permiso solo muestra el nombre o «Sin taller»", () => {
    const { rerender } = render(
      <PieceWorkshopField
        piece={piece}
        workshops={workshops}
        canAssign={false}
      />,
    );
    expect(screen.getByText("Taller Norte")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(
      <PieceWorkshopField
        piece={{ ...piece, workshopId: null, workshopName: null }}
        workshops={workshops}
        canAssign={false}
      />,
    );
    expect(screen.getByText("Sin taller")).toBeInTheDocument();
  });

  it("no se cambia con la pieza en el taller o cerrada", () => {
    for (const status of ["enviada_taller", "entregada", "anulada"] as const) {
      const { unmount } = render(
        <PieceWorkshopField
          piece={{ ...piece, status }}
          workshops={workshops}
          canAssign
        />,
      );
      expect(screen.queryByRole("button")).toBeNull();
      unmount();
    }
  });
});
