"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { EDIT_ICON_CLASS } from "@/components/icons/icon-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  QUOTE_ISSUER_DOCUMENT_LABELS,
  QUOTE_ISSUERS_TITLE,
  quoteIssuerPdfLines,
  type QuoteIssuer,
} from "@/domain/quote-issuers";
import {
  deleteQuoteIssuer,
  setQuoteIssuerActive,
} from "@/server/quote-issuers-actions";

import { QuoteIssuerDialog } from "./quote-issuer-dialog";

function IssuerActions({ issuer }: { issuer: QuoteIssuer }) {
  const [pending, startTransition] = useTransition();
  const toggle = () =>
    startTransition(async () => {
      const result = await setQuoteIssuerActive(issuer.id, !issuer.active);
      if ("error" in result) toast.error(result.error);
      else
        toast.success(
          issuer.active
            ? `"${issuer.name}" fue desactivada.`
            : `"${issuer.name}" fue activada.`,
        );
    });

  return (
    <div className="flex flex-wrap gap-2">
      <QuoteIssuerDialog
        issuer={issuer}
        trigger={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar ${issuer.name}`}
          >
            <Pencil className={EDIT_ICON_CLASS} />
            Editar
          </Button>
        }
      />
      <Button
        variant={issuer.active ? "outline" : "default"}
        size="sm"
        disabled={pending}
        onClick={toggle}
      >
        {issuer.active ? "Desactivar" : "Activar"}
      </Button>
      <ConfirmDeleteDialog
        title="Eliminar sucursal de cotización"
        name={issuer.name}
        hint="Atención: son datos bancarios y tributarios. Si alguna cotización ya la usa, no se podrá eliminar: desactívala."
        onConfirm={() => deleteQuoteIssuer(issuer.id)}
        trigger={
          <Button
            variant="outline"
            size="sm"
            aria-label={`Eliminar ${issuer.name}`}
          >
            <Trash2 className="text-destructive" />
            Eliminar
          </Button>
        }
      />
    </div>
  );
}

/**
 * Sucursales que emiten las cotizaciones (solo admin): su razón social, DNI/RUC y
 * cuenta bancaria salen en el PDF. Se muestran tal como aparecerán en él.
 */
export function QuoteIssuersManager({ issuers }: { issuers: QuoteIssuer[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>{QUOTE_ISSUERS_TITLE}</CardTitle>
          <CardDescription>
            Se elige una en cada cotización; su razón social, RUC y cuenta
            bancaria salen en el PDF encima de «Atentamente,» (si es una persona
            con DNI, solo la cuenta). Sin sucursal no se genera el PDF. Son
            datos sensibles: revisa bien antes de editarlos. Solo se borran las
            que ninguna cotización usa; las demás se desactivan.
          </CardDescription>
        </div>
        <QuoteIssuerDialog
          trigger={
            <Button>
              <Plus />
              Agregar
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        {issuers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aún no hay sucursales de cotización.
          </p>
        ) : (
          <ul className="divide-y" aria-label={QUOTE_ISSUERS_TITLE}>
            {issuers.map((issuer) => (
              <li
                key={issuer.id}
                className="flex flex-wrap items-start justify-between gap-3 py-4"
                data-testid={`sucursal-cotizacion-${issuer.name}`}
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        issuer.active
                          ? "text-heading font-medium"
                          : "text-muted-foreground font-medium"
                      }
                    >
                      {issuer.name}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {QUOTE_ISSUER_DOCUMENT_LABELS[issuer.documentType]}{" "}
                      {issuer.documentNumber}
                    </span>
                    {issuer.active ? null : (
                      <Badge variant="outline">Inactiva</Badge>
                    )}
                  </p>
                  <div className="text-muted-foreground text-sm break-words">
                    {quoteIssuerPdfLines(issuer).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
                <IssuerActions issuer={issuer} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
