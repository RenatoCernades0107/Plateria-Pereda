import type { NextRequest } from "next/server";

import { DEFAULT_PATH, isPublicPath } from "@/lib/auth/paths";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSession(url, response);
  }

  if (isAuthenticated && pathname === "/login") {
    return redirectWithSession(new URL(DEFAULT_PATH, request.url), response);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo excepto archivos estáticos e imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
