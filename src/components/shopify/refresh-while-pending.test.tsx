import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshWhilePending } from "./refresh-while-pending";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("RefreshWhilePending", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("refresca mientras hay pendientes, con un máximo de intentos", () => {
    render(<RefreshWhilePending pending intervalMs={1000} maxTries={3} />);
    vi.advanceTimersByTime(10_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("no refresca si no hay pendientes", () => {
    render(<RefreshWhilePending pending={false} />);
    vi.advanceTimersByTime(10_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
