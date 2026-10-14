"use client";

import { createContext, useContext, useEffect, useState } from "react";

const BreadcrumbContext = createContext<{
  label: string | null;
  setLabel: (label: string | null) => void;
}>({ label: null, setLabel: () => {} });

/** Guarda el nombre del registro abierto para la ruta de navegación del encabezado. */
export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [label, setLabel] = useState<string | null>(null);
  return (
    <BreadcrumbContext value={{ label, setLabel }}>
      {children}
    </BreadcrumbContext>
  );
}

/** Nombre del registro abierto (p. ej. el código de la guía), si la página lo indicó. */
export function useBreadcrumbLabel() {
  return useContext(BreadcrumbContext).label;
}

/**
 * Lo pone un detalle (p. ej. "RES-00012") para que el encabezado muestre
 * "Restauraciones › RES-00012", con la sección como enlace. No renderiza nada.
 */
export function PageBreadcrumb({ label }: { label: string }) {
  const { setLabel } = useContext(BreadcrumbContext);
  useEffect(() => {
    setLabel(label);
    return () => setLabel(null);
  }, [label, setLabel]);
  return null;
}
