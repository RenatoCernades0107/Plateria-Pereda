import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  describe("antes y después por destino", () => {
    const setup = (files: RestorationFile[], props = {}) => {
      render(
        <FileGallery
          files={files}
          targets={[{ id: null, label: "General (todas las piezas)" }, target]}
          currentUserId="u1"
          isAdmin={false}
          {...props}
        />,
      );
      return screen.getByRole("region", { name: target.label });
    };
    const thumbs = (el: HTMLElement) =>
      within(el)
        .getAllByRole("button", { name: /^Ver / })
        .map((b) => b.getAttribute("aria-label"));

    it("separa las fotos en Antes y Después, cada una con su miniatura", () => {
      const section = setup([
        photo("despues", "u1", "despues"),
        photo("antes-1"),
        photo("antes-2"),
      ]);
      const antes = within(section).getByRole("group", { name: "Antes (2)" });
      const despues = within(section).getByRole("group", {
        name: "Después (1)",
      });
      expect(thumbs(antes)).toEqual(["Ver antes-1.png", "Ver antes-2.png"]);
      expect(thumbs(despues)).toEqual(["Ver despues.png"]);
      // Ya no hay carrusel ni selector.
      expect(
        within(section).queryByRole("group", { name: "Fotos" }),
      ).toBeNull();
      expect(
        within(section).queryByRole("group", { name: "Clasificación" }),
      ).toBeNull();
      expect(
        within(section).queryByRole("button", { name: /^Mostrar / }),
      ).toBeNull();
    });

    it("el visor empieza en la foto pulsada y sigue el orden Antes → Después", async () => {
      const user = userEvent.setup();
      const section = setup([
        photo("despues", "u1", "despues"),
        photo("antes-1"),
        photo("antes-2"),
      ]);
      await user.click(
        within(section).getByRole("button", { name: "Ver antes-2.png" }),
      );
      const viewer = screen.getByRole("dialog");
      expect(viewer).toHaveTextContent("2 de 3");
      expect(
        within(viewer).getByRole("img", { name: "antes-2.png" }),
      ).toBeVisible();
      await user.click(
        within(viewer).getByRole("button", { name: "Siguiente" }),
      );
      expect(
        within(screen.getByRole("dialog")).getByRole("img", {
          name: "despues.png",
        }),
      ).toBeVisible();
      expect(screen.getByRole("dialog")).toHaveTextContent("3 de 3");
    });

    it("si falta antes o después, su columna lo dice", () => {
      const section = setup([photo("antes")]);
      const despues = within(section).getByRole("group", {
        name: "Después (0)",
      });
      expect(despues).toHaveTextContent("Sin fotos de después aún");
      expect(
        within(section).getByRole("group", { name: "Antes (1)" }),
      ).not.toHaveTextContent("Sin fotos");

      cleanup();
      const other = setup([photo("despues", "u1", "despues")]);
      expect(
        within(other).getByRole("group", { name: "Antes (0)" }),
      ).toHaveTextContent("Sin fotos de antes aún");
    });

    it("borrar en la miniatura solo aparece en lo propio, o para el admin", () => {
      const section = setup([photo("mia"), photo("ajena", "u2", "despues")]);
      expect(
        within(section).getByRole("button", { name: "Borrar mia.png" }),
      ).toBeVisible();
      expect(
        within(section).queryByRole("button", { name: "Borrar ajena.png" }),
      ).toBeNull();

      cleanup();
      const admin = setup([photo("mia"), photo("ajena", "u2", "despues")], {
        isAdmin: true,
      });
      expect(
        within(admin).getByRole("button", { name: "Borrar ajena.png" }),
      ).toBeVisible();
    });

    it("las fotos de documento van en su propio grupo, sin columnas antes/después", () => {
      const section = setup([photo("boleta", "u1", "documento")]);
      expect(
        thumbs(within(section).getByRole("group", { name: "Documento (1)" })),
      ).toEqual(["Ver boleta.png"]);
      expect(
        within(section).queryByRole("group", { name: /^Antes/ }),
      ).toBeNull();
      expect(
        within(section).queryByRole("group", { name: /^Después/ }),
      ).toBeNull();
    });

    it("con una sola foto no hay comparación", () => {
      const section = setup([photo("sola")]);
      expect(
        within(section).getByRole("button", { name: "Ver sola.png" }),
      ).toHaveClass("cursor-zoom-in");
      expect(
        within(section).queryByRole("button", {
          name: "Comparar antes y después",
        }),
      ).toBeNull();
    });

    it("compara antes y después cuando hay de los dos", async () => {
      const user = userEvent.setup();
      const section = setup([
        photo("antes"),
        photo("despues", "u1", "despues"),
      ]);
      await user.click(
        within(section).getByRole("button", {
          name: "Comparar antes y después",
        }),
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(`Antes y después · ${target.label}`);
      expect(within(dialog).getByAltText("antes.png")).toBeInTheDocument();
      expect(within(dialog).getByAltText("despues.png")).toBeInTheDocument();
    });

    it("los PDF y HEIC van en una lista aparte; sin fotos no hay columnas", async () => {
      const user = userEvent.setup();
      const section = setup([
        {
          ...photo("guia", "u1", "documento"),
          name: "guia.pdf",
          mimeType: "application/pdf",
        },
        {
          ...photo("foto", "u2", "otro"),
          name: "foto.heic",
          mimeType: "image/heic",
        },
      ]);
      expect(within(section).queryByRole("group")).toBeNull();
      const list = within(section).getByRole("list", { name: "Archivos" });
      expect(list).toHaveTextContent("guia.pdf");
      expect(list).toHaveTextContent("Documento · 1 KB");
      expect(list).toHaveTextContent("foto.heic");
      // Se borra lo propio, no lo ajeno.
      expect(
        within(list).getByRole("button", { name: "Borrar guia.pdf" }),
      ).toBeVisible();
      expect(
        within(list).queryByRole("button", { name: "Borrar foto.heic" }),
      ).toBeNull();

      await user.click(
        within(list).getByRole("button", { name: "Ver guia.pdf" }),
      );
      const viewer = screen.getByRole("dialog");
      expect(
        within(viewer).getByRole("link", { name: "Descargar" }),
      ).toBeVisible();
      expect(within(viewer).getByRole("link", { name: "Abrir" })).toBeVisible();
    });

    it("puede ocultar el nombre del destino sin perder la región accesible", () => {
      const section = setup([photo("a")], { showTargetLabels: false });
      expect(
        within(section).getByRole("heading", { name: target.label }),
      ).toHaveClass("sr-only");
    });
  });
});
