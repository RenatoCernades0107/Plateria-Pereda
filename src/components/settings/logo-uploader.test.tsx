import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LogoUploader } from "./logo-uploader";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  setLogo: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
vi.mock("@/server/settings-actions", () => ({
  setLogo: (path: string | null) => mocks.setLogo(path),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));

const png = () => new File(["x"], "logo.png", { type: "image/png" });

describe("LogoUploader", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.setLogo.mockResolvedValue({ ok: true });
  });

  it("sube el archivo al bucket y guarda su ruta", async () => {
    const user = userEvent.setup();
    render(<LogoUploader logoUrl={null} />);
    expect(screen.getByText("Sin logo")).toBeInTheDocument();

    await user.upload(screen.getByLabelText("Archivo del logo"), png());

    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^logo\/[\w-]+\.png$/),
      expect.any(File),
      expect.objectContaining({ contentType: "image/png" }),
    );
    expect(mocks.setLogo).toHaveBeenCalledWith(mocks.upload.mock.calls[0]?.[0]);
    expect(mocks.success).toHaveBeenCalledWith("Logo actualizado.");
  });

  it("rechaza un archivo inválido sin subirlo", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<LogoUploader logoUrl={null} />);
    await user.upload(
      screen.getByLabelText("Archivo del logo"),
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "El logo debe ser PNG, JPG o WebP.",
    );
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("si falla la subida muestra el error", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "x" } });
    const user = userEvent.setup();
    render(<LogoUploader logoUrl={null} />);
    await user.upload(screen.getByLabelText("Archivo del logo"), png());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo subir el logo.",
    );
    expect(mocks.setLogo).not.toHaveBeenCalled();
  });

  it("si no se puede guardar la ruta borra el archivo subido", async () => {
    mocks.setLogo.mockResolvedValue({
      error: "No se pudo actualizar el logo.",
    });
    const user = userEvent.setup();
    render(<LogoUploader logoUrl={null} />);
    await user.upload(screen.getByLabelText("Archivo del logo"), png());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo actualizar el logo.",
    );
    expect(mocks.remove).toHaveBeenCalledWith([
      mocks.upload.mock.calls[0]?.[0],
    ]);
  });

  it("muestra el logo actual y permite quitarlo", async () => {
    const user = userEvent.setup();
    render(<LogoUploader logoUrl="https://cdn.test/logo.png" />);
    expect(
      screen.getByRole("img", { name: "Logo de la empresa" }),
    ).toHaveAttribute("src", "https://cdn.test/logo.png");
    await user.click(screen.getByRole("button", { name: "Quitar" }));
    expect(mocks.setLogo).toHaveBeenCalledWith(null);
    expect(mocks.success).toHaveBeenCalledWith("Logo eliminado.");
  });
});
