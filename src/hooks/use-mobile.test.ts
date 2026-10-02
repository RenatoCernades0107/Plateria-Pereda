import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.spyOn(window, "matchMedia").mockImplementation(
    () => mql as unknown as MediaQueryList,
  );
  return {
    change(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("es false en pantallas anchas y true en angostas", () => {
    mockMatchMedia(false);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
    mockMatchMedia(true);
    expect(renderHook(() => useIsMobile()).result.current).toBe(true);
  });

  it("se actualiza cuando cambia el tamaño de la pantalla", () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    act(() => media.change(true));
    expect(result.current).toBe(true);
  });
});
