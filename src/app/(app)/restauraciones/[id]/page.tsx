import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { FilesPanel } from "@/components/files/files-panel";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PaymentsList } from "@/components/payments/payments-list";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { RegisterPaymentDialog } from "@/components/payments/register-payment-dialog";
import { ResyncPaymentsButton } from "@/components/payments/resync-payments-button";
import {
  EditRestorationDialog,
  PieceDialog,
} from "@/components/restorations/edit-dialogs";
import { CloseRestorationMenu } from "@/components/restorations/close-restoration-menu";
import { MoneySummary } from "@/components/restorations/money-summary";
import { RestorationStatusSummary } from "@/components/restorations/piece-history";
import {
  GUIDE_CARD_CLASS,
  GuideEyebrow,
  PiecesHeading,
} from "@/components/restorations/guide-labels";
import { PiecesBoard } from "@/components/restorations/pieces-board";
import { RestorationPiecesKanban } from "@/components/restorations/restoration-pieces-kanban";
import { RestorationQuoteMessageButton } from "@/components/restorations/restoration-quote-message-button";
import {
  PaymentStatusBadge,
  RestorationStatusBadge,
} from "@/components/restorations/status-badges";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ViewToggle } from "@/components/view-toggle";
import { WHATSAPP_BADGE_CLASS } from "@/components/whatsapp-badge";
import { SHOPIFY_BADGE_CLASS, ShopifyBadge } from "@/components/shopify-badge";
import { formatCents, PAYMENT_TYPE_LABELS } from "@/domain/money";
import { firstBeforePhotos } from "@/domain/files";
import { can } from "@/domain/permissions";
import { igvLabel, igvTotals } from "@/domain/igv";
import { suggestedPayment } from "@/domain/payments";
import { formatPhone } from "@/domain/phone";
import { editableFields, SALE_PRICE_HINT } from "@/domain/restoration-edit";
import {
  parseRestorationPiecesView,
  restorationPiecesHref,
} from "@/domain/restoration-pieces-view";
import {
  missingSalePrices,
  RESTORATION_ORIGIN_LABELS,
} from "@/domain/restoration-status";
import { isClosedStatus } from "@/domain/piece-state-machine";
import { serverEnv } from "@/lib/env.server";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { listCatalog } from "@/server/catalogs";
import { listRestorationFiles } from "@/server/files/queries";
import { getBalanceDue, listPayments } from "@/server/payments/queries";
import { getSyncStates } from "@/server/clients/queries";
import {
  getRestorationDetail,
  getStatusHistory,
} from "@/server/restorations/queries";
import { getSettings } from "@/server/settings";
import { shopifyOrderAdminUrl } from "@/server/shopify/admin-url";

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

  const query = await searchParams;
  const justCreated = query.registrada === "1";
  // Piezas en lista (por defecto) o en kanban por estado (`?vista=kanban`).
  const piecesView = parseRestorationPiecesView(query);
  const settings = canSeeMoney ? await getSettings() : null;
  // Mensaje de cotización: se arma en el diálogo con las piezas que se elijan.
  const quoteData = settings
    ? {
        code: restoration.code,
        clientName: restoration.client.name,
        contactName: restoration.contact?.name ?? null,
        pricesIncludeIgv: restoration.money?.pricesIncludeIgv ?? true,
        paymentType: restoration.paymentType,
        depositPercent: restoration.money?.depositPercent ?? 0,
        terms: settings.terms,
      }
    : null;
  const quotePieces = restoration.pieces.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description,
    service: p.serviceName || null,
    // Sin precio de venta (D58) el mensaje dice "por definir".
    priceCents: p.priceCents,
    status: p.status,
  }));
  // Cerrar la guía a mano (solo Anulada o Rechazada): quien anula o rechaza piezas.
  const canClose =
    can(user.role, "piezas.consultar-aprobar-anular") &&
    !["anulada", "rechazada", "completada"].includes(restoration.status) &&
    restoration.pieces.some((p) => !isClosedStatus(p.status));
  const phone = restoration.contact?.phone ?? restoration.client.phone;
  // Orden de Shopify (9.1): enlace al admin y estado del último envío (admin y ventas).
  const orderUrl = shopifyOrderAdminUrl(
    serverEnv().SHOPIFY_STORE_DOMAIN,
    restoration.shopifyOrderId,
  );
  const lastSync = canSeeMoney
    ? (await getSyncStates("restorations", [restoration.id])).get(
        restoration.id,
      )
    : undefined;
  // Un envío "ok" sin orden fue omitido (la restauración dejó de estar lista): no se muestra.
  const sync =
    lastSync && (lastSync.status !== "ok" || restoration.shopifyOrderName)
      ? lastSync
      : undefined;
  // Cotización de la que salió (P46): solo un enlace, y solo para quien ve cotizaciones.
  const quote =
    restoration.whatsappQuoteId && can(user.role, "cotizaciones-whatsapp.usar")
      ? await getQuoteCode(restoration.whatsappQuoteId)
      : null;

  // Edición (Paso 7.7): catálogos, talleres y contactos solo para quien edita.
  const editing = canSeeMoney
    ? await loadEditingData(restoration.client)
    : null;
  const ctx = { role: user.role, hasOrder: restoration.hasOrder };
  const workshops = await listActiveWorkshops();

  // Historial de estados (8.5, admin y ventas). La línea de tiempo de cada pieza está
  // en su detalle (/piezas/[id]).
  const [history, files, payments, methods, balanceDue] = await Promise.all([
    canSeeMoney ? getStatusHistory(restoration.id) : Promise.resolve([]),
    listRestorationFiles(restoration.id),
    canSeeMoney ? listPayments(restoration.id) : Promise.resolve([]),
    canSeeMoney
      ? listCatalog("payment_methods", { onlyActive: true })
      : Promise.resolve([]),
    getBalanceDue(restoration.id),
  ]);
  // Pagos (11.2): monto sugerido y, al aprobar la última pieza sin orden aún, el
  // adelanto que la orden incluirá (al contado, el total; a cuenta, el %; P28).
  const money = restoration.money;
  const suggested = money
    ? suggestedPayment({
        paymentType: restoration.paymentType,
        totalCents: money.totalCents,
        paidCents: money.paidCents,
        expectedDepositCents: money.expectedDepositCents,
      })
    : null;
  const paymentMethods = methods.map((m) => ({ id: m.id, name: m.name }));
  // Precios de venta que faltan para la orden de Shopify (D58).
  const missingPrices = canSeeMoney
    ? missingSalePrices(restoration.pieces, restoration.hasOrder)
    : null;
  // Sin todos los precios el adelanto aún no se conoce (ni se crea la orden al aprobar).
  const unpricedPieces = restoration.pieces.some(
    (p) => p.priceCents === null && !isClosedStatus(p.status),
  );
  const approvalPayment =
    money &&
    suggested &&
    !restoration.hasOrder &&
    !unpricedPieces &&
    can(user.role, "pagos.registrar") &&
    money.expectedDepositCents > money.paidCents
      ? { methods: paymentMethods, suggested }
      : null;
  // Fotos y archivos (Fase 10): la foto general o la de cada pieza.
  const fileTargets = [
    { id: null, label: "General (todas las piezas)" },
    ...restoration.pieces.map((p) => ({
      id: p.id,
      label: `${p.code} · ${p.description}`,
    })),
  ];
  // Miniatura de cada pieza en la tabla: su primera foto "Antes".
  const photos = firstBeforePhotos(files);

  return (
    <div className="space-y-6">
      <RefreshWhilePending
        pending={sync?.status === "pending" || sync?.status === "processing"}
      />
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/restauraciones">
          <ArrowLeft />
          Restauraciones
        </Link>
      </Button>

      {/* La guía (la restauración) en su propia tarjeta; sus piezas van debajo. */}
      <section
        aria-labelledby="codigo-guia"
        className={cn(GUIDE_CARD_CLASS, "space-y-4")}
        data-testid="guia"
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <GuideEyebrow />
            <h1
              id="codigo-guia"
              className="text-heading text-2xl font-semibold tracking-tight"
            >
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
                <PaymentStatusBadge
                  status={restoration.money.paymentStatus}
                  data-testid="estado-pago"
                />
              ) : null}
              <Badge variant="outline">
                {PAYMENT_TYPE_LABELS[restoration.paymentType]}
                {restoration.money?.depositAmountCents != null
                  ? ` (${formatCents(restoration.money.depositAmountCents)}${
                      restoration.money.depositPercent === null
                        ? ""
                        : ` · ${restoration.money.depositPercent} %`
                    })`
                  : restoration.money?.depositPercent
                    ? ` (${restoration.money.depositPercent} %)`
                    : ""}
              </Badge>
              {restoration.money ? (
                <Badge variant="outline" data-testid="igv">
                  {igvLabel(restoration.money.pricesIncludeIgv)}
                </Badge>
              ) : null}
              {restoration.shopifyOrderName ? (
                // Con el logotipo y el verde de Shopify; con enlace al admin se ve
                // como enlace (ícono de pestaña nueva y subrayado al pasar).
                orderUrl ? (
                  <Badge
                    variant="outline"
                    asChild
                    className={SHOPIFY_BADGE_CLASS}
                  >
                    <a
                      href={orderUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir la orden en Shopify (pestaña nueva)"
                      data-testid="orden-shopify"
                    >
                      <ShopifyIcon />
                      Orden {restoration.shopifyOrderName}
                      <ExternalLink aria-hidden />
                    </a>
                  </Badge>
                ) : (
                  <ShopifyBadge data-testid="orden-shopify">
                    Orden {restoration.shopifyOrderName}
                  </ShopifyBadge>
                )
              ) : null}
              {sync ? (
                <SyncStatus
                  jobId={sync.jobId}
                  status={sync.status}
                  lastError={sync.lastError}
                />
              ) : null}
              <Badge
                variant="outline"
                data-testid="origen"
                className={
                  restoration.origin === "whatsapp"
                    ? WHATSAPP_BADGE_CLASS
                    : undefined
                }
              >
                {restoration.origin === "whatsapp" ? <WhatsAppIcon /> : null}
                {RESTORATION_ORIGIN_LABELS[restoration.origin]}
                {quote ? (
                  <>
                    {" · desde "}
                    <Link
                      href={`/cotizaciones-whatsapp/${restoration.whatsappQuoteId}`}
                      className="underline underline-offset-4"
                    >
                      {quote}
                    </Link>
                  </>
                ) : null}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <EditRestorationDialog
                restorationId={restoration.id}
                initial={{
                  contactId: restoration.contact?.id ?? null,
                  paymentType: restoration.paymentType,
                  depositAmountCents:
                    restoration.money?.depositAmountCents ??
                    (restoration.paymentType === "a_cuenta" &&
                    restoration.money?.depositPercent
                      ? restoration.money.expectedDepositCents
                      : null),
                  totalCents: restoration.money?.totalCents ?? 0,
                  pricesIncludeIgv: restoration.money?.pricesIncludeIgv ?? true,
                  notes: restoration.notes,
                }}
                contacts={editing.contacts}
                hasOrder={restoration.hasOrder}
                hasPayments={payments.length > 0}
              />
            ) : null}
            {canClose ? (
              <CloseRestorationMenu
                restorationId={restoration.id}
                code={restoration.code}
              />
            ) : null}
            {settings && quoteData ? (
              <RestorationQuoteMessageButton
                template={settings.whatsappTemplate}
                data={quoteData}
                pieces={quotePieces}
                phone={phone}
                autoOpen={justCreated}
              />
            ) : null}
          </div>
        </header>

        {restoration.money ? (
          <div className="space-y-1 border-t pt-4">
            <MoneySummary
              totalCents={restoration.money.totalCents}
              paidCents={restoration.money.paidCents}
              igv={{
                ...igvTotals(
                  restoration.pieces
                    .filter((p) => !isClosedStatus(p.status))
                    .map((p) => p.priceCents ?? 0),
                  restoration.money.pricesIncludeIgv,
                ),
                included: restoration.money.pricesIncludeIgv,
              }}
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
          <div className="space-y-1 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium">
              Notas generales
            </p>
            <p className="text-sm whitespace-pre-line">{restoration.notes}</p>
          </div>
        ) : null}
      </section>

      {restoration.money &&
      restoration.hasOrder &&
      restoration.money.paidCents > restoration.money.totalCents ? (
        <p
          role="alert"
          className="border-destructive/50 text-destructive rounded-md border p-3 text-sm"
        >
          El cliente pagó{" "}
          {formatCents(
            restoration.money.paidCents - restoration.money.totalCents,
          )}{" "}
          más que el nuevo total: registra el reembolso (P12).
        </p>
      ) : null}

      {missingPrices ? (
        <p
          role="status"
          className="bg-muted rounded-md border p-3 text-sm"
          data-testid="faltan-precios"
        >
          {missingPrices.message}
          {user.role === "admin"
            ? " Asígnalos en la columna «Precio venta» de cada pieza."
            : " Los asigna el administrador."}
        </p>
      ) : null}

      <Tabs defaultValue="piezas">
        <TabsList>
          <TabsTrigger value="piezas">
            Piezas ({restoration.pieces.length})
          </TabsTrigger>
          {canSeeMoney ? <TabsTrigger value="pagos">Pagos</TabsTrigger> : null}
          <TabsTrigger value="archivos">
            Archivos{files.length > 0 ? ` (${files.length})` : ""}
          </TabsTrigger>
          {canSeeMoney ? (
            <TabsTrigger value="historial">Historial</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="piezas" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <PiecesHeading count={restoration.pieces.length} />
            <div className="flex flex-wrap items-center gap-2">
              <ViewToggle
                view={piecesView === "kanban" ? "kanban" : "tabla"}
                tableLabel="Lista"
                tableHref={restorationPiecesHref(restoration.id, "lista")}
                kanbanHref={restorationPiecesHref(restoration.id, "kanban")}
              />
              {editing && editableFields(ctx).canAddPieces ? (
                <PieceDialog
                  restorationId={restoration.id}
                  editable={editableFields(ctx).piece}
                  priceHint={SALE_PRICE_HINT}
                  workshops={workshops}
                  materials={editing.materials}
                  services={editing.services}
                />
              ) : null}
            </div>
          </div>
          {piecesView === "kanban" ? (
            <RestorationPiecesKanban
              restorationId={restoration.id}
              pieces={restoration.pieces}
              role={user.role}
              workshops={workshops}
              approvalPayment={approvalPayment}
              balanceDue={balanceDue}
            />
          ) : (
            <PiecesBoard
              restorationId={restoration.id}
              pieces={restoration.pieces}
              role={user.role}
              workshops={workshops}
              photos={photos}
              approvalPayment={approvalPayment}
              balanceDue={balanceDue}
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
                          ? "Con la orden de Shopify creada, el precio se cambia con «Cambiar precio» (con motivo)."
                          : SALE_PRICE_HINT,
                      priceChange: Object.fromEntries(
                        restoration.pieces.map((piece) => [
                          piece.id,
                          editableFields(ctx, piece).priceNeedsOrderFlow,
                        ]),
                      ),
                      materials: editing.materials,
                      services: editing.services,
                    }
                  : null
              }
            />
          )}
        </TabsContent>
        {canSeeMoney ? (
          <TabsContent value="pagos" className="space-y-4">
            {money ? (
              <div className="flex flex-wrap gap-2">
                <RegisterPaymentDialog
                  restorationId={restoration.id}
                  balanceCents={money.totalCents - money.paidCents}
                  suggested={suggested}
                  methods={paymentMethods}
                />
                {can(user.role, "pagos.corregir") ? (
                  <RefundDialog
                    restorationId={restoration.id}
                    paidCents={money.paidCents}
                    methods={paymentMethods}
                  />
                ) : null}
                {can(user.role, "pagos.corregir") && restoration.hasOrder ? (
                  <ResyncPaymentsButton restorationId={restoration.id} />
                ) : null}
              </div>
            ) : null}
            <PaymentsList payments={payments} />
          </TabsContent>
        ) : null}
        <TabsContent value="archivos">
          <FilesPanel
            restorationId={restoration.id}
            files={files}
            targets={fileTargets}
            canUpload={can(user.role, "fotos.subir")}
            currentUserId={user.id}
            isAdmin={user.role === "admin"}
          />
        </TabsContent>
        {canSeeMoney ? (
          <TabsContent value="historial" className="space-y-6">
            <section className="space-y-2" aria-labelledby="cambios-estado">
              <h2 id="cambios-estado" className="text-heading font-semibold">
                Cambios de estado
              </h2>
              <RestorationStatusSummary
                pieces={restoration.pieces}
                events={history}
              />
            </section>
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

/** Código de la cotización de WhatsApp (la RLS solo deja leerla a admin y ventas). */
async function getQuoteCode(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_quotes")
    .select("code")
    .eq("id", id)
    .maybeSingle();
  return data?.code ?? null;
}
