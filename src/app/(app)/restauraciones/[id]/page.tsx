import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityHistorySection } from "@/components/audit/entity-history-section";
import {
  EditRestorationDialog,
  PieceDialog,
} from "@/components/restorations/edit-dialogs";
import { MoneySummary } from "@/components/restorations/money-summary";
import { PiecesBoard } from "@/components/restorations/pieces-board";
import { QuoteMessageButton } from "@/components/restorations/quote-message-button";
import { RestorationStatusBadge } from "@/components/restorations/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatCents,
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
} from "@/domain/money";
import { can } from "@/domain/permissions";
import { formatPhone } from "@/domain/phone";
import { editableFields } from "@/domain/restoration-edit";
import { buildQuoteMessage } from "@/domain/whatsapp-quote";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";
import { getRestorationDetail } from "@/server/restorations/queries";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Restauración" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RestauracionDetallePage({
  params,
  searchParams,
}: PageProps<"/restauraciones/[id]">) {
  const user = await requirePermission("restauraciones.ver");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  // Montos, pagos e historial: solo admin y ventas (P42).
  const canSeeMoney = can(user.role, "restauraciones.editar");
  const restoration = await getRestorationDetail(id, {
    withMoney: canSeeMoney,
  });
  if (!restoration) notFound();

  const justCreated = (await searchParams).registrada === "1";
  const settings = canSeeMoney ? await getSettings() : null;
  const message = settings
    ? buildQuoteMessage(settings.whatsappTemplate, {
        code: restoration.code,
        clientName: restoration.client.name,
        contactName: restoration.contact?.name ?? null,
        pieces: restoration.pieces.map((p) => ({
          description: p.description,
          service: p.serviceName || null,
          priceCents: p.priceCents ?? 0,
          status: p.status,
        })),
        paymentType: restoration.paymentType,
        depositPercent: restoration.money?.depositPercent ?? 0,
        terms: settings.terms,
      })
    : null;
  const phone = restoration.contact?.phone ?? restoration.client.phone;

  // Edición (Paso 7.7): catálogos, talleres y contactos solo para quien edita.
  const editing = canSeeMoney
    ? await loadEditingData(restoration.client)
    : null;
  const ctx = { role: user.role, hasOrder: restoration.hasOrder };
  const workshops = await listActiveWorkshops();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/restauraciones">
          <ArrowLeft />
          Restauraciones
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-heading text-2xl font-semibold tracking-tight">
            {restoration.code}
          </h1>
          <p className="text-sm">
            <Link
              href={`/clientes/${restoration.client.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {restoration.client.name}
            </Link>
            {restoration.contact ? (
              <span className="text-muted-foreground">
                {" "}
                · Contacto: {restoration.contact.name}
              </span>
            ) : null}
            {phone ? (
              <span className="text-muted-foreground">
                {" "}
                · {formatPhone(phone)}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <span data-testid="estado-restauracion" className="contents">
              <RestorationStatusBadge status={restoration.status} />
            </span>
            {restoration.money ? (
              <Badge variant="outline" data-testid="estado-pago">
                {PAYMENT_STATUS_LABELS[restoration.money.paymentStatus]}
              </Badge>
            ) : null}
            <Badge variant="outline">
              {PAYMENT_TYPE_LABELS[restoration.paymentType]}
              {restoration.money?.depositPercent
                ? ` (${restoration.money.depositPercent} %)`
                : ""}
            </Badge>
            {restoration.shopifyOrderName ? (
              <Badge variant="secondary">
                Shopify {restoration.shopifyOrderName}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <EditRestorationDialog
              restorationId={restoration.id}
              initial={{
                contactId: restoration.contact?.id ?? null,
                paymentType: restoration.paymentType,
                depositPercent: restoration.money?.depositPercent ?? null,
                notes: restoration.notes,
              }}
              contacts={editing.contacts}
            />
          ) : null}
          {message ? (
            <QuoteMessageButton
              message={message}
              phone={phone}
              autoOpen={justCreated}
            />
          ) : null}
        </div>
      </header>

      {restoration.money ? (
        <div className="space-y-1">
          <MoneySummary
            totalCents={restoration.money.totalCents}
            paidCents={restoration.money.paidCents}
          />
          {restoration.money.expectedDepositCents > 0 ? (
            <p className="text-muted-foreground text-sm">
              Adelanto esperado:{" "}
              {formatCents(restoration.money.expectedDepositCents)}
            </p>
          ) : null}
        </div>
      ) : null}

      {restoration.notes ? (
        <p className="rounded-md border p-3 text-sm whitespace-pre-line">
          {restoration.notes}
        </p>
      ) : null}

      <Tabs defaultValue="piezas">
        <TabsList>
          <TabsTrigger value="piezas">
            Piezas ({restoration.pieces.length})
          </TabsTrigger>
          {canSeeMoney ? <TabsTrigger value="pagos">Pagos</TabsTrigger> : null}
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
          {canSeeMoney ? (
            <TabsTrigger value="historial">Historial</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="piezas" className="space-y-3">
          {editing && editableFields(ctx).canAddPieces ? (
            <PieceDialog
              restorationId={restoration.id}
              workshops={workshops}
              materials={editing.materials}
              services={editing.services}
            />
          ) : null}
          <PiecesBoard
            restorationId={restoration.id}
            pieces={restoration.pieces}
            role={user.role}
            workshops={workshops}
            editing={
              editing
                ? {
                    editable: Object.fromEntries(
                      restoration.pieces.map((piece) => [
                        piece.id,
                        editableFields(ctx, piece).piece,
                      ]),
                    ),
                    priceHint:
                      user.role === "admin"
                        ? "Con la orden de Shopify creada, el precio se cambia desde la orden (con motivo)."
                        : "Con la orden de Shopify creada, solo el administrador cambia el precio.",
                    materials: editing.materials,
                    services: editing.services,
                  }
                : null
            }
          />
        </TabsContent>
        {canSeeMoney ? (
          <TabsContent value="pagos">
            <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
              Aquí se registrarán los pagos (adelanto y saldo).
            </p>
          </TabsContent>
        ) : null}
        <TabsContent value="archivos">
          <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
            Aquí se verán las fotos de las piezas.
          </p>
        </TabsContent>
        {canSeeMoney ? (
          <TabsContent value="historial">
            <EntityHistorySection
              table="restorations"
              recordId={restoration.id}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

/** Catálogos activos y contactos de la empresa para los diálogos de edición. */
async function loadEditingData(client: { id: string; kind: string }) {
  const supabase = await createClient();
  const [materials, services, contacts] = await Promise.all([
    listCatalog("materials", { onlyActive: true }),
    listCatalog("services", { onlyActive: true }),
    client.kind === "empresa"
      ? supabase
          .from("contacts")
          .select("id, display_name, position")
          .eq("client_id", client.id)
          .eq("active", true)
          .order("display_name")
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (contacts.error) throw contacts.error;
  const option = ({
    id,
    name,
    price,
  }: {
    id: string;
    name: string;
    price: number | null;
  }) => ({
    id,
    name,
    price,
  });
  return {
    materials: materials.map(option),
    services: services.map(option),
    contacts: contacts.data
      ? contacts.data.map((k) => ({
          id: k.id,
          name: k.display_name ?? "",
          position: k.position,
        }))
      : null,
  };
}

/** Talleres activos (todos los roles envían piezas al taller o lo asignan). */
async function listActiveWorkshops() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshops")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data;
}
