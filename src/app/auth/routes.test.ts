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

const { GET: salir } = await import("./salir/route");

const req = (path: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"));

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
