import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersTable, type UserRow } from "./users-table";

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/server/users-actions", () => ({
  deleteUser: (...a: unknown[]) => mocks.deleteUser(...a),
  resendAccess: vi.fn(),
  setUserActive: vi.fn(),
  updateUserRole: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const users: UserRow[] = [
  {
    id: "admin-1",
    fullName: "Ada Admin",
    email: "ada@pereda.test",
    role: "admin",
    active: true,
  },
  {
    id: "u2",
    fullName: "Nora Nueva",
    email: "nora@pereda.test",
    role: "ventas",
    active: true,
  },
];

function row(email: string) {
  return screen.getByTestId(`usuario-${email}`);
}

describe("UsersTable: eliminar", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it("el admin no puede eliminarse a sí mismo", () => {
    render(<UsersTable users={users} currentUserId="admin-1" />);
    expect(
      within(row("ada@pereda.test")).getByRole("button", {
        name: "Eliminar Ada Admin",
      }),
    ).toBeDisabled();
    expect(
      within(row("nora@pereda.test")).getByRole("button", {
        name: "Eliminar Nora Nueva",
      }),
    ).toBeEnabled();
  });

  it("elimina a un usuario después de confirmar", async () => {
    mocks.deleteUser.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<UsersTable users={users} currentUserId="admin-1" />);
    await user.click(
      within(row("nora@pereda.test")).getByRole("button", {
        name: "Eliminar Nora Nueva",
      }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Eliminar usuario");
    expect(dialog).toHaveTextContent('¿Eliminar "Nora Nueva"?');
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(mocks.deleteUser).toHaveBeenCalledWith("u2");
    expect(mocks.success).toHaveBeenCalledWith('"Nora Nueva" fue eliminado.');
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("si tiene actividad muestra el aviso y sugiere desactivarlo", async () => {
    const message =
      "“Nora Nueva” tiene actividad en el sistema (2 restauraciones). Desactívalo en su lugar.";
    mocks.deleteUser.mockResolvedValue({ error: message });
    const user = userEvent.setup();
    render(<UsersTable users={users} currentUserId="admin-1" />);
    await user.click(
      within(row("nora@pereda.test")).getByRole("button", {
        name: "Eliminar Nora Nueva",
      }),
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(mocks.success).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
  });
});
