/** Rutas a las que se entra sin sesión. */
const PUBLIC_PATHS = [
  "/login",
  "/recuperar-contrasena",
  "/auth/confirm",
  "/auth/salir",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/** La raíz redirige a la pantalla de inicio de cada rol (ver `homePathFor`). */
export const DEFAULT_PATH = "/";

/** Solo permite volver a rutas internas: evita redirigir a otros sitios (open redirect). */
export function safeNextPath(next: string | null | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  ) {
    return DEFAULT_PATH;
  }
  return next;
}
