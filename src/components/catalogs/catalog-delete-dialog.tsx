"use client";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CATALOGS, type CatalogKind } from "@/domain/catalogs";
import { deleteCatalogItem } from "@/server/catalogs-actions";

/**
 * Confirma y borra un ítem del catálogo. Si está en uso (en piezas, cotizaciones o pagos)
 * la BD lo rechaza y el aviso, que sugiere desactivarlo, se muestra en el diálogo.
 */
export function CatalogDeleteDialog({
  kind,
  item,
  trigger,
}: {
  kind: CatalogKind;
  item: { id: string; name: string };
  trigger: React.ReactNode;
}) {
  const catalog = CATALOGS[kind];
  return (
    <ConfirmDeleteDialog
      title={`Eliminar ${catalog.singular}`}
      name={item.name}
      hint={catalog.deleteHint}
      onConfirm={() => deleteCatalogItem(kind, item.id)}
      trigger={trigger}
    />
  );
}
