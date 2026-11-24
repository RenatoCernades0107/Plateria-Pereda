import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import config from "../../next.config";

// El mismo path-to-regexp con el que Next evalúa `source` (sin tipos propios).
const { match } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  match: (
    source: string,
  ) => (pathname: string) => false | { params: Record<string, unknown> };
};

async function redirects() {
  const resolved = config("phase-test");
  return (await resolved.redirects?.()) ?? [];
}

/** Aplica el redirect como lo hace Next: patrón de `source` + sustitución en `destination`. */
async function redirectOf(pathname: string) {
  for (const rule of await redirects()) {
    const matched = match(rule.source)(pathname);
    if (!matched) continue;
    const rest = matched.params.path as string | string[] | undefined;
    const tail = Array.isArray(rest) ? rest.join("/") : (rest ?? "");
    return {
      to: rule.destination.replace(/\/?:path\*$/, tail ? `/${tail}` : ""),
      permanent: rule.permanent,
    };
  }
  return null;
}

describe("redirects de next.config", () => {
  it("/cotizaciones (raíz) pasa a /corporativo de forma permanente", async () => {
    expect(await redirectOf("/cotizaciones")).toEqual({
      to: "/corporativo",
      permanent: true,
    });
  });

  it("conserva el resto de la ruta", async () => {
    expect(await redirectOf("/cotizaciones/nueva")).toEqual({
      to: "/corporativo/nueva",
      permanent: true,
    });
    expect((await redirectOf("/cotizaciones/abc-123"))?.to).toBe(
      "/corporativo/abc-123",
    );
  });

  it("no toca /cotizaciones-whatsapp ni /corporativo", async () => {
    expect(await redirectOf("/cotizaciones-whatsapp")).toBeNull();
    expect(await redirectOf("/cotizaciones-whatsapp/abc")).toBeNull();
    expect(await redirectOf("/corporativo")).toBeNull();
  });
});
