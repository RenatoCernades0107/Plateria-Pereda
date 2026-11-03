import { ArrowLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, FilteredEmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/page-header";
import { AllPaymentsTable } from "@/components/payments/all-payments-table";
import { PaymentsFiltersForm } from "@/components/payments/payments-filters-form";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/domain/money";
import {
  parsePaymentListFilters,
  paymentListHref,
  paymentListQuery,
  PAYMENTS_PATH,
} from "@/domain/payment-list-filters";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import {
  listAllPayments,
  listPaymentMethodNames,
} from "@/server/payments/queries";

export const metadata: Metadata = { title: "Pagos de restauraciones" };

/**
 * Pagos y reembolsos de todas las restauraciones, con lo cobrado en el periodo y el
 * CSV. Solo admin y ventas (P42).
 */
export default async function PagosRestauracionesPage({
  searchParams,
}: PageProps<"/restauraciones/pagos">) {
  await requirePermission("restauraciones.editar");
  const filters = parsePaymentListFilters(await searchParams);
  const supabase = await createClient();
  const [page, methods, branches] = await Promise.all([
    listAllPayments(filters),
    listPaymentMethodNames(),
    // Con las inactivas: un pago antiguo pudo cobrarse en una sucursal que ya no está.
    supabase.from("branches").select("id, name").order("name"),
  ]);
  if (branches.error) throw branches.error;
  const { items, total, pages, paidCents, refundedCents } = page;
  const query = paymentListQuery(filters, { page: 1 });
  const summary = [
    { label: "Cobrado", value: paidCents, testId: "pagos-cobrado" },
    { label: "Reembolsado", value: refundedCents, testId: "pagos-reembolsado" },
    { label: "Neto", value: paidCents - refundedCents, testId: "pagos-neto" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <PageHeader
          title="Pagos de restauraciones"
          description="Pagos y reembolsos de todas las restauraciones, del más reciente al más antiguo."
        />
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/restauraciones">
              <ArrowLeft />
              Volver a restauraciones
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/api/restauraciones/pagos/exportar${query ? `?${query}` : ""}`}
              download
            >
              <Download />
              Exportar CSV
            </a>
          </Button>
        </div>
      </div>
      <PaymentsFiltersForm
        filters={filters}
        methods={methods}
        branches={branches.data}
      />
      <div className="border-t pt-4">
        <dl className="grid max-w-xl grid-cols-3 gap-3">
          {summary.map((item) => (
            <div key={item.testId} className="min-w-0 rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">{item.label}</dt>
              <dd
                data-testid={item.testId}
                className="text-heading truncate font-semibold tabular-nums"
              >
                {formatCents(item.value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-3 text-sm" data-testid="resumen">
          {total === 1 ? "1 movimiento" : `${total} movimientos`}
        </p>
      </div>
      <AllPaymentsTable
        payments={items}
        empty={
          query ? (
            <FilteredEmptyState resetHref={PAYMENTS_PATH} />
          ) : (
            <EmptyState title="Aún no hay pagos registrados." />
          )
        }
      />
      <Pagination
        page={filters.page}
        pages={pages}
        total={total}
        noun={["movimiento", "movimientos"]}
        hrefFor={(p) => paymentListHref(filters, { page: p })}
      />
    </div>
  );
}
