"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Mientras haya sincronizaciones pendientes, refresca la página cada pocos segundos
 * (como máximo un minuto) para mostrar el estado final sin recargar a mano.
 */
export function RefreshWhilePending({
  pending,
  intervalMs = 3000,
  maxTries = 20,
}: {
  pending: boolean;
  intervalMs?: number;
  maxTries?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= maxTries) clearInterval(timer);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [pending, intervalMs, maxTries, router]);
  return null;
}
