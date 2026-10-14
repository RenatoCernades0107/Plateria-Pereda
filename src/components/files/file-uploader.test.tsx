import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileUploader } from "./file-uploader";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    storage: { from: () => ({ upload: mocks.upload }) },
  }),
}));
vi.mock("@/server/files/actions", () => ({
  registerRestorationFile: (input: unknown) => mocks.register(input),
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));

const RESTORATION = "11111111-1111-4111-8111-111111111111";
const PIECE = "22222222-2222-4222-8222-222222222222";
const png = () => new File(["x"], "foto.png", { type: "image/png" });

describe("FileUploader", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.register.mockResolvedValue({ ok: true });
  });

  it("en una pieza el destino es fijo y lo subido va a esa pieza", async () => {
    const user = userEvent.setup();
    render(
      <FileUploader
        restorationId={RESTORATION}
        targets={[{ id: PIECE, label: "RES-00001-1 · Fuente" }]}
      />,
    );
    // Se muestra como texto: no hay selector para cambiarlo.
    expect(screen.getByTestId("archivo-destino-fijo")).toHaveTextContent(
      "RES-00001-1 · Fuente",
    );
    expect(screen.queryByRole("combobox", { name: "Para" })).toBeNull();

    await user.upload(screen.getByLabelText("Archivos a subir"), png());

    await waitFor(() => expect(mocks.register).toHaveBeenCalled());
    expect(mocks.register).toHaveBeenCalledWith(
      expect.objectContaining({ restorationId: RESTORATION, pieceId: PIECE }),
    );
    expect(mocks.upload.mock.calls[0]![0]).toMatch(
      `restorations/${RESTORATION}/pieces/${PIECE}/`,
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(screen.getByText("Listo")).toBeInTheDocument();
  });

  it("en la guía se elige el destino y empieza en «General»", async () => {
    const user = userEvent.setup();
    render(
      <FileUploader
        restorationId={RESTORATION}
        targets={[
          { id: null, label: "General (todas las piezas)" },
          { id: PIECE, label: "RES-00001-1 · Fuente" },
        ]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Para" })).toHaveTextContent(
      "General (todas las piezas)",
    );
    expect(screen.queryByTestId("archivo-destino-fijo")).toBeNull();

    await user.upload(screen.getByLabelText("Archivos a subir"), png());
    await waitFor(() =>
      expect(mocks.register).toHaveBeenCalledWith(
        expect.objectContaining({ pieceId: null }),
      ),
    );
  });
});
