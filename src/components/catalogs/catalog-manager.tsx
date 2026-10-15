"use client";

import { Pencil, Plus } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { Badge } from "@/components/ui/badge";
import { EDIT_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div className="flex shrink-0 gap-2 md:justify-end">
      <CatalogItemDialog
        kind={kind}
        item={item}
        trigger={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar ${item.name}`}
          >
            <Pencil className={EDIT_ICON_CLASS} />
            Editar
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

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "secondary" : "outline"}>
      {active ? "Activo" : "Inactivo"}
    </Badge>
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
          <>
            {/* Como una hoja de cálculo en la computadora (D63); lista en el celular. */}
            <div className="hidden rounded-md border md:block">
              <Table aria-label={catalog.title}>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    {catalog.hasPrice ? (
                      <TableHead className="text-right">
                        Precio sugerido
                      </TableHead>
                    ) : null}
                    {catalog.hasShopifyName ? (
                      <TableHead>
                        <span className="inline-flex items-center gap-1.5">
                          <ShopifyIcon className="text-shopify-strong size-4" />
                          Nombre en Shopify
                        </span>
                      </TableHead>
                    ) : null}
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      data-testid={`catalogo-${item.name}`}
                    >
                      <TableCell
                        className={
                          item.active
                            ? "text-heading font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {item.name}
                      </TableCell>
                      {catalog.hasPrice ? (
                        <TableCell className="text-right tabular-nums">
                          {item.price === null ? (
                            <span className="text-muted-foreground">
                              Sin precio sugerido
                            </span>
                          ) : (
                            formatMoney(item.price)
                          )}
                        </TableCell>
                      ) : null}
                      {catalog.hasShopifyName ? (
                        <TableCell>
                          {item.shopifyName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell>
                        <StatusBadge active={item.active} />
                      </TableCell>
                      <TableCell>
                        <ItemActions kind={kind} item={item} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y md:hidden" aria-label={catalog.title}>
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  data-testid={`catalogo-movil-${item.name}`}
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
                    {catalog.hasShopifyName && item.shopifyName ? (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
                        <ShopifyIcon className="text-shopify-strong size-3.5" />
                        Shopify: {item.shopifyName}
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
