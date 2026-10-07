"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Abre el diálogo de impresión del navegador: ahí se elige "Guardar como PDF".
 * Con `autoPrint` lo abre solo al cargar la página.
 */
export function PrintButton({ autoPrint = false }: { autoPrint?: boolean }) {
  useEffect(() => {
    if (autoPrint) window.print();
  }, [autoPrint]);

  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer />
      Descargar PDF
    </Button>
  );
}
