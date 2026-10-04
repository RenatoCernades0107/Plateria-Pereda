"use client";

import { Pencil, Plus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CATALOGS, type CatalogKind } from "@/domain/catalogs";
import { formatMoney } from "@/lib/format";
import { setCatalogItemActive } from "@/server/catalogs-actions";

import { CatalogItemDialog, type CatalogItemRow } from "./catalog-item-dialog";

function ItemActions({
  kind,
  item,
}: {
  kind: CatalogKind;
  item: CatalogItemRow;
}) {
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const result = await setCatalogItemActive(kind, item.id, !item.active);
      if ("error" in result) toast.error(result.error);
      else
        toast.success(
          item.active
            ? `"${item.name}" fue desactivado.`
            : `"${item.name}" fue activado.`,
        );
    });

  return (
    <div className="flex shrink-0 gap-2">
      <CatalogItemDialog
        kind={kind}
        item={item}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Editar ${item.name}`}>
            <Pencil />
          </Button>
        }
      />
      <Button
        variant={item.active ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={toggle}
      >
        {item.active ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}

/** Lista y gestión de un catálogo (materiales, servicios o métodos de pago). */
export function CatalogManager({
  kind,
  items,
}: {
  kind: CatalogKind;
  items: CatalogItemRow[];
}) {
  const catalog = CATALOGS[kind];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{catalog.title}</CardTitle>
          <CardDescription>{catalog.description}</CardDescription>
        </div>
        <CatalogItemDialog
          kind={kind}
          trigger={
            <Button>
              <Plus />
              Agregar
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aún no hay {catalog.title.toLowerCase()}.
          </p>
        ) : (
          <ul className="divide-y" aria-label={catalog.title}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                data-testid={`catalogo-${item.name}`}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className={
                      item.active
                        ? "text-heading font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {item.name}
                  </span>
                  {catalog.hasPrice ? (
                    <span className="text-muted-foreground text-sm">
                      {item.price === null
                        ? "Sin precio sugerido"
                        : formatMoney(item.price)}
                    </span>
                  ) : null}
                  {item.active ? null : (
                    <Badge variant="outline">Inactivo</Badge>
                  )}
                </div>
                <ItemActions kind={kind} item={item} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
