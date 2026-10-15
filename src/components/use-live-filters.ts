"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

/** Espera tras la última tecla antes de buscar. */
export const LIVE_SEARCH_DELAY_MS = 400;

const trimmed = <F extends object>(filters: F): F =>
  Object.fromEntries(
    Object.entries(filters).map(([k, v]) => [
      k,
      typeof v === "string" ? v.trim() : v,
    ]),
  ) as F;

/**
 * Filtros que se aplican solos (búsqueda en tiempo real): el texto, con una espera
 * corta al escribir; las listas y fechas, al elegirlas. Los filtros siguen en la URL
 * (se reemplaza la entrada del historial, así "Atrás" no recorre cada tecla).
 *
 * El formulario no se vuelve a montar al cambiar la URL (perdería el foco al
 * escribir): si la URL cambia por otro lado (un chip, la vista, "Atrás"), el
 * formulario toma esos filtros; si es el eco de lo que el propio formulario aplicó,
 * conserva lo escrito (p. ej. un espacio al final que la URL no guarda).
 *
 * `toHref` arma la URL de unos filtros (en la página 1).
 */
export function useLiveFilters<F extends object>(
  filters: F,
  toHref: (filters: F) => string,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(filters);
  const current = toHref(filters);
  const [seen, setSeen] = useState(current);
  // URLs que aplicó este formulario y aún no llegan.
  const [own, setOwn] = useState<string[]>([]);
  if (current !== seen) {
    setSeen(current);
    const index = own.indexOf(current);
    if (index >= 0) {
      setOwn(own.slice(index + 1));
    } else {
      setOwn([]);
      setState(filters);
    }
  }

  // La última URL pedida: la actual, o la que este formulario aplicó y aún no llega.
  const latest = useRef(current);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (own.length === 0) latest.current = current;
  }, [current, own]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = (next: F) => {
    clearTimeout(timer.current);
    const href = toHref(trimmed(next));
    if (href === latest.current) return;
    latest.current = href;
    setOwn((list) => [...list, href]);
    startTransition(() => router.replace(href, { scroll: false }));
  };

  /** Cambia filtros; `debounce` para el texto que se está escribiendo. */
  const update = (patch: Partial<F>, { debounce = false } = {}) => {
    const next = { ...state, ...patch };
    setState(next);
    clearTimeout(timer.current);
    if (debounce) {
      timer.current = setTimeout(() => apply(next), LIVE_SEARCH_DELAY_MS);
    } else {
      apply(next);
    }
  };

  /** Vuelve a los filtros vacíos. */
  const reset = (empty: F) => {
    setState(empty);
    apply(empty);
  };

  /** Enter en la búsqueda: aplica de inmediato, sin esperar. */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply(state);
  };

  return { state, update, reset, submit, pending };
}
