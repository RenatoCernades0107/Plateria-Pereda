import Link from "next/link";

import { PieceStatusBadge } from "@/components/restorations/status-badges";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/domain/money";
import type { WorkshopPiece } from "@/server/workshop-pieces";

import { ServiceCostCell } from "./service-cost-cell";

const dash = <span className="text-muted-foreground">—</span>;

/**
 * Piezas que van a un taller, con lo que el proveedor necesita para cotizar y
 * trabajar: restauración, estado, pieza, descripción, servicio, medida, material,
 * peso y costo de servicio. Pensada para tomar captura o imprimir a PDF.
 */
export function WorkshopPiecesTable({
  pieces,
  totalCostCents,
  canEditCost,
}: {
  pieces: WorkshopPiece[];
  totalCostCents: number;
  canEditCost: boolean;
}) {
  if (pieces.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
        Este taller no tiene piezas pendientes.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID restauración</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>ID pieza</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Servicio</TableHead>
          <TableHead>Medida</TableHead>
          <TableHead>Material</TableHead>
          <TableHead className="text-right">Peso</TableHead>
          <TableHead className="text-right">Costo de servicio</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pieces.map((p) => (
          <TableRow key={p.id} data-testid={`pieza-${p.code}`}>
            <TableCell className="whitespace-nowrap">
              <Link
                href={`/restauraciones/${p.restorationId}`}
                className="underline-offset-4 hover:underline print:no-underline"
              >
                {p.restorationCode}
              </Link>
            </TableCell>
            <TableCell>
              <PieceStatusBadge status={p.status} />
            </TableCell>
            <TableCell className="text-heading font-medium whitespace-nowrap">
              {p.code}
            </TableCell>
            <TableCell className="max-w-64 break-words whitespace-normal">
              {p.description}
            </TableCell>
            <TableCell className="whitespace-normal">
              {p.serviceName || dash}
            </TableCell>
            <TableCell className="whitespace-normal">
              {p.measure || dash}
            </TableCell>
            <TableCell className="whitespace-normal">
              {p.materialName || dash}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              {p.weightGrams === null ? dash : `${p.weightGrams} g`}
            </TableCell>
            <TableCell className="text-right">
              <ServiceCostCell
                pieceId={p.id}
                pieceCode={p.code}
                cents={p.serviceCostCents}
                editable={canEditCost}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={8} className="text-right font-medium">
            Total del taller (todas las piezas pendientes)
          </TableCell>
          <TableCell className="text-right font-medium tabular-nums">
            {formatCents(totalCostCents)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
