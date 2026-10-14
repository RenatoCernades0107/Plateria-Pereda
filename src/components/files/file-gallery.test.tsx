import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RestorationFile } from "@/server/files/queries";

import { FileGallery } from "./file-gallery";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/server/files/actions", () => ({
  deleteRestorationFile: (id: string) => mocks.remove(id),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));

const PIECE = "p1";
const target = { id: PIECE, label: "RES-00001-1 · Fuente" };

const photo = (
  id: string,
  createdBy = "u1",
  category: RestorationFile["category"] = "antes",
): RestorationFile => ({
  id,
  pieceId: PIECE,
  name: `${id}.png`,
  mimeType: "image/png",
  sizeBytes: 1000,
  category,
  createdBy,
  createdByName: "Vera Ventas",
  createdAt: "2026-10-01T15:00:00Z",
  url: `https://example.test/${id}.png`,
  downloadUrl: `https://example.test/${id}.png?download`,
});

describe("FileGallery", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.remove.mockResolvedValue({ ok: true });
  });

  it("sin archivos muestra el texto vacío indicado", () => {
    render(
      <FileGallery
        files={[]}
        targets={[target]}
        currentUserId="u1"
        isAdmin={false}
        emptyText="La pieza aún no tiene fotos."
      />,
    );
    expect(
      screen.getByText("La pieza aún no tiene fotos."),
    ).toBeInTheDocument();
  });

  it("la miniatura invita a ampliar y abre el visor con anterior/siguiente", async () => {
    const user = userEvent.setup();
    render(
      <FileGallery
        files={[photo("a"), photo("b"), photo("c", "u1", "despues")]}
        targets={[target]}
        currentUserId="u1"
        isAdmin={false}
      />,
    );
    const thumb = screen.getByRole("button", { name: "Ver a.png" });
    expect(thumb).toHaveClass("cursor-zoom-in");

    await user.click(thumb);
    const viewer = screen.getByRole("dialog");
    expect(within(viewer).getByRole("img", { name: "a.png" })).toBeVisible();
    expect(viewer).toHaveTextContent("1 de 3");

    await user.click(within(viewer).getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("2 de 3");
    await user.keyboard("{ArrowRight}");
    expect(
      within(screen.getByRole("dialog")).getByRole("img", { name: "c.png" }),
    ).toBeVisible();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Siguiente",
      }),
    );
    // Da la vuelta al primero.
    expect(screen.getByRole("dialog")).toHaveTextContent("1 de 3");
  });

  it("cada foto propia tiene botón de borrar que pide confirmación", async () => {
    const user = userEvent.setup();
    render(
      <FileGallery
        files={[photo("a"), photo("ajena", "u2")]}
        targets={[target]}
        currentUserId="u1"
        isAdmin={false}
      />,
    );
    // Lo ajeno no se puede borrar (salvo el admin).
    expect(
      screen.queryByRole("button", { name: "Borrar ajena.png" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Borrar a.png" }));
    const confirm = screen.getByRole("dialog");
    expect(confirm).toHaveTextContent("¿Borrar «a.png»?");
    expect(mocks.remove).not.toHaveBeenCalled();

    await user.click(
      within(confirm).getByRole("button", { name: "Sí, borrar" }),
    );
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.success).toHaveBeenCalledWith("Archivo borrado.");
  });

  it("cancelar no borra", async () => {
    const user = userEvent.setup();
    render(
      <FileGallery
        files={[photo("a")]}
        targets={[target]}
        currentUserId="otro"
        isAdmin
      />,
    );
    await user.click(screen.getByRole("button", { name: "Borrar a.png" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
