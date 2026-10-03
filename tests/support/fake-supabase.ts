import { vi } from "vitest";

type AuthError = { code: string } | null;

type Profile = { full_name?: string; role?: string; active?: boolean } | null;

/** Cliente de Supabase simulado con lo que usan las acciones y helpers de autenticación. */
export function fakeSupabase(
  options: {
    user?: { id: string; email?: string } | null;
    profile?: Profile;
  } = {},
) {
  const maybeSingle = vi.fn(async () => ({
    data: options.profile ?? null,
    error: null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return {
    from: vi.fn(() => ({ select })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: options.user ?? null } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null as AuthError })),
      verifyOtp: vi.fn(async () => ({ error: null as AuthError })),
    },
  };
}

/** Imita `redirect` de Next, que corta la ejecución lanzando un error. */
export function redirectMock() {
  return vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
}
