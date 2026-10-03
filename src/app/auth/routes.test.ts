import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fakeSupabase,
  redirectMock,
} from "../../../tests/support/fake-supabase";

const mocks = vi.hoisted(() => ({
  supabase: null as unknown as ReturnType<
    typeof import("../../../tests/support/fake-supabase").fakeSupabase
  >,
  redirect: null as unknown as ReturnType<
    typeof import("../../../tests/support/fake-supabase").redirectMock
  >,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mocks.supabase,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

const { GET: confirm } = await import("./confirm/route");
const { GET: salir } = await import("./salir/route");

const req = (path: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"));

describe("/auth/confirm", () => {
  beforeEach(() => {
    mocks.supabase = fakeSupabase();
    mocks.redirect = redirectMock();
  });

  it("con un token válido abre la sesión y va al destino", async () => {
    await expect(
      confirm(
        req(
          "/auth/confirm?token_hash=abc&type=recovery&next=/restablecer-contrasena",
        ),
      ),
    ).rejects.toThrow("REDIRECT:/restablecer-contrasena");
    expect(mocks.supabase.auth.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "abc",
    });
  });

  it("con un token inválido o incompleto avisa en el login", async () => {
    mocks.supabase.auth.verifyOtp.mockResolvedValue({
      error: { code: "otp_expired" },
    } as never);
    await expect(
      confirm(req("/auth/confirm?token_hash=abc&type=recovery")),
    ).rejects.toThrow("REDIRECT:/login?motivo=enlace-invalido");
    await expect(confirm(req("/auth/confirm"))).rejects.toThrow(
      "REDIRECT:/login?motivo=enlace-invalido",
    );
  });
});

describe("/auth/salir", () => {
  beforeEach(() => {
    mocks.supabase = fakeSupabase();
    mocks.redirect = redirectMock();
  });

  it("cierra la sesión y conserva solo motivos conocidos", async () => {
    await expect(salir(req("/auth/salir?motivo=inactivo"))).rejects.toThrow(
      "REDIRECT:/login?motivo=inactivo",
    );
    expect(mocks.supabase.auth.signOut).toHaveBeenCalled();
    await expect(salir(req("/auth/salir?motivo=<script>"))).rejects.toThrow(
      "REDIRECT:/login",
    );
  });
});
