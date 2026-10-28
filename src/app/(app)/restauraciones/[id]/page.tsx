import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBreadcrumb } from "@/components/page-breadcrumb";
import { EntityHistorySection } from "@/components/audit/entity-history-section";
import { FilesPanel } from "@/components/files/files-panel";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Notice } from "@/components/notice";
import { PaymentsList } from "@/components/payments/payments-list";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { RegisterPaymentDialog } from "@/components/payments/register-payment-dialog";
import { ResyncPaymentsButton } from "@/components/payments/resync-payments-button";
import {
  EditRestorationDialog,
  PieceDialog,
} from "@/components/restorations/edit-dialogs";
import { CloseRestorationMenu } from "@/components/restorations/close-restoration-menu";
import { GuidePdfButton } from "@/components/restorations/guide-pdf-button";
import { MoneySummary } from "@/components/restorations/money-summary";
import { RestorationStatusSummary } from "@/components/restorations/piece-history";
import {
  GUIDE_CARD_CLASS,
  GuideEyebrow,
  PiecesHeading,
} from "@/components/restorations/guide-labels";
import { PiecesBoard } from "@/components/restorations/pieces-board";
import { RestorationPiecesKanban } from "@/components/restorations/restoration-pieces-kanban";
import {
  ChangeRestorationKindButton,
  RestorationKindBadge,
} from "@/components/restorations/restoration-kind-dialog";
import { RestorationQuoteMessageButton } from "@/components/restorations/restoration-quote-message-button";
import {
  ObservedBadge,
  PaymentStatusBadge,
  RestorationStatusBadge,
} from "@/components/restorations/status-badges";
import { RefreshWhilePending } from "@/components/shopify/refresh-while-pending";
import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/url-tabs";
import { ViewToggle } from "@/components/view-toggle";
import { SHOPIFY_BADGE_CLASS, ShopifyBadge } from "@/components/shopify-badge";
import { formatCents, PAYMENT_TYPE_LABELS } from "@/domain/money";
import { firstBeforePhotos } from "@/domain/files";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { can } from "@/domain/permissions";
import { suggestedPayment } from "@/domain/payments";
import { formatPhone } from "@/domain/phone";
import { editableFields, SALE_PRICE_HINT } from "@/domain/restoration-edit";
import {
  parseRestorationPiecesView,
  restorationPiecesHref,
} from "@/domain/restoration-pieces-view";
import {
  isChargedKind,
  missingSalePrices,
  observedProgress,
  RESTORATION_KIND_LABELS,
  RESTORATION_ORIGIN_LABELS,
} from "@/domain/restoration-status";
import { isClosedStatus } from "@/domain/piece-state-machine";
import { serverEnv } from "@/lib/env.server";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/server/auth";
import { recordMetadata } from "@/server/page-titles";
import { listCatalog, serviceNamesById } from "@/server/catalogs";
import { listRestorationFiles } from "@/server/files/queries";
import { getBalanceDue, listPayments } from "@/server/payments/queries";
import { getSyncStates } from "@/server/clients/queries";
import {
  getProfileName,
  getRestorationDetail,
  getStatusHistory,
} from "@/server/restorations/queries";
import { getSettings } from "@/server/settings";
import { shopifyOrderAdminUrl } from "@/server/shopify/admin-url";

export async function generateMetadata({
  params,
}: PageProps<"/restauraciones/[id]">): Promise<Metadata> {
  return recordMetadata("restoration", (await params).id, "Restauración");
}

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
  // Cliente, contacto y PDF de la guía: logística no los ve.
  const canSeeClient = can(user.role, "clientes.ver");
  const canExportPdf = can(user.role, "guias.exportar-pdf");
  const restoration = await getRestorationDetail(id, {
    withMoney: canSeeMoney,
    withClient: canSeeClient,
  });
  if (!restoration) notFound();

  // Guía interna u observada (punto 8): no se cobra. Sin precios, pagos ni Shopify.
  const kind = restoration.kind;
  const charged = isChargedKind(kind);
  const kindNotice = charged
    ? null
    : `Guía ${RESTORATION_KIND_LABELS[kind].toLowerCase()}: sin cobro`;

  const query = await searchParams;
  const justCreated = query.registrada === "1";
  // Se registró, pero el adelanto no quedó como pago (se registra desde Pagos).
  const depositPending = query.adelanto === "pendiente";
  // Se creó desde una cotización de WhatsApp, pero no se copiaron todas sus fotos.
  const photosPending = query.fotos === "pendiente";
  // Piezas en lista (por defecto) o en kanban por estado (`?vista=kanban`).
  const piecesView = parseRestorationPiecesView(query);
  // Pestaña abierta (`?pestana=pagos`): sobrevive a recargas y se puede enlazar.
  const tabs = canSeeMoney
    ? charged
      ? ["piezas", "pagos", "archivos", "historial"]
      : ["piezas", "archivos", "historial"]
    : ["piezas", "archivos"];
  const tab =
    typeof query.pestana === "string" && tabs.includes(query.pestana)
      ? query.pestana
      : "piezas";
  // Datos de la empresa (los leen todos) para el PDF; el resto, solo admin y ventas.
  const company = await getSettings();
  const settings = canSeeMoney ? company : null;
  // Mensaje de cotización: se arma en el diálogo con las piezas que se elijan.
  const clientPhone =
    restoration.client?.phone ?? restoration.contact?.phone ?? null;
  const quoteData =
    settings && charged
      ? {
          code: restoration.code,
          clientName: restoration.client?.name ?? "",
          contactName: restoration.contact?.name ?? null,
          clientPhone: clientPhone ? formatPhone(clientPhone) : null,
          clientDocument: restoration.client?.document?.number ?? null,
          paymentType: restoration.paymentType,
          depositPercent: restoration.money?.depositPercent ?? 0,
          terms: settings.terms,
        }
      : null;
  const serviceNames = quoteData ? await serviceNamesById() : new Map();
  const quotePieces = restoration.pieces.map((p) => ({
    id: p.id,
    code: p.code,
    description: p.description,
    quantity: p.quantity,
    service: p.serviceName || null,
    // Un servicio por línea en el mensaje.
    services: p.serviceIds.flatMap((id) => serviceNames.get(id) ?? []),
    // Sin precio de venta (D58) el mensaje dice "por definir".
    priceCents: p.priceCents,
    status: p.status,
  }));
  // "2 de 4 piezas observadas" junto al estado, si alguna pieza está en Observación.
  const observed = observedProgress(restoration.pieces);
  // Cerrar la guía a mano (solo Anulada o Rechazada): quien anula o rechaza piezas.
  const canClose =
    can(user.role, "piezas.consultar-aprobar-anular") &&
    !["anulada", "rechazada", "completada"].includes(restoration.status) &&
    restoration.pieces.some((p) => !isClosedStatus(p.status));
  const phone = restoration.contact?.phone ?? restoration.client?.phone ?? null;
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
    charged &&
    lastSync &&
    (lastSync.status !== "ok" || restoration.shopifyOrderName)
      ? lastSync
      : undefined;
  // Cotización de la que salió (P46): solo un enlace, y solo para quien ve cotizaciones.
  const quote =
    restoration.whatsappQuoteId && can(user.role, "cotizaciones-whatsapp.usar")
      ? await getQuoteCode(restoration.whatsappQuoteId)
      : null;

  // Edición (Paso 7.7): catálogos, talleres y contactos solo para quien edita.
  const editing =
    canSeeMoney && restoration.client
      ? await loadEditingData(restoration.client)
      : null;
  const ctx = { role: user.role, hasOrder: restoration.hasOrder };
  const workshops = await listActiveWorkshops();
  // En una guía que no se cobra, la pieza no lleva precio de venta (la BD lo rechaza).
  const withoutPriceIfFree = <T extends string>(fields: readonly T[]) =>
    charged ? fields : fields.filter((f) => f !== "price");

  // Historial de estados (8.5, admin y ventas). La línea de tiempo de cada pieza está
  // en su detalle (/piezas/[id]).
  const [history, files, payments, methods, branchItems, balanceDue] =
    await Promise.all([
      canSeeMoney ? getStatusHistory(restoration.id) : Promise.resolve([]),
      listRestorationFiles(restoration.id),
      canSeeMoney ? listPayments(restoration.id) : Promise.resolve([]),
      canSeeMoney
        ? listCatalog("payment_methods", { onlyActive: true })
        : Promise.resolve([]),
      canSeeMoney
        ? listCatalog("branches", { onlyActive: true })
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
  const branches = branchItems.map((b) => ({ id: b.id, name: b.name }));
  // Precios de venta que faltan para la orden de Shopify (D58).
  const missingPrices = canSeeMoney
    ? missingSalePrices(restoration.pieces, restoration.hasOrder, kind)
    : null;
  // Sin todos los precios el adelanto aún no se conoce (ni se crea la orden al aprobar).
  const unpricedPieces = restoration.pieces.some(
    (p) => p.priceCents === null && !isClosedStatus(p.status),
  );
  const approvalPayment =
    charged &&
    money &&
    suggested &&
    !restoration.hasOrder &&
    !unpricedPieces &&
    can(user.role, "pagos.registrar") &&
    money.expectedDepositCents > money.paidCents
      ? { methods: paymentMethods, branches, suggested }
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
  // Quien registró la guía: los perfiles ajenos no se leen con RLS, solo el nombre.
  const attendedBy = restoration.createdBy
    ? await getProfileName(restoration.createdBy)
    : null;
  // Exportar la guía en PDF (con las piezas que se elijan; montos solo si se ven).
  const pdfData = {
    company: {
      name: company.legalName || "Platería Pereda",
      phones: company.phones,
      email: company.email,
    },
    code: restoration.code,
    createdAt: restoration.createdAt,
    status: restoration.status,
    kind,
    paymentType: restoration.paymentType,
    clientName: restoration.client?.name ?? "",
    document: restoration.client?.document ?? null,
    contactName: restoration.contact?.name ?? null,
    phone: phone ? formatPhone(phone) : null,
    shopifyOrderName: restoration.shopifyOrderName,
    attendedBy,
    notes: restoration.notes,
    pieces: restoration.pieces.map((p) => ({
      id: p.id,
      code: p.code,
      quantity: p.quantity,
      description: p.description,
      materialName: p.materialName,
      serviceName: p.serviceName,
      measure: p.measure,
      weightGrams: p.weightGrams,
      status: p.status,
      location: p.location,
      notes: p.notes,
      priceCents: p.priceCents,
    })),
    money: restoration.money
      ? {
          totalCents: restoration.money.totalCents,
          paidCents: restoration.money.paidCents,
        }
      : null,
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb label={restoration.code} />
      <RefreshWhilePending
        pending={sync?.status === "pending" || sync?.status === "processing"}
      />
      {/* En pantallas grandes la ruta de navegación del encabezado ya lleva atrás. */}
      <Button asChild variant="ghost" size="sm" className="-ml-2 md:hidden">
        <Link href="/restauraciones">
          <ArrowLeft />
          Restauraciones
        </Link>
      </Button>

      {/*
        La guía (la restauración) en su tarjeta, con el fondo de la guía; sus piezas,
        pagos, archivos e historial en pestañas. En pantallas anchas, dos columnas: la
        guía a la izquierda (fija al bajar) y las pestañas a la derecha; si no, debajo.
      */}
      <div className="wide:grid-cols-[20rem_minmax(0,1fr)] grid items-start gap-6">
        <section
          aria-labelledby="codigo-guia"
          className={cn(
            GUIDE_CARD_CLASS,
            "wide:sticky wide:top-4 wide:max-h-[calc(100svh-2rem)] wide:overflow-y-auto space-y-4",
          )}
          data-testid="guia"
        >
          <header className="wide:flex-col flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <GuideEyebrow />
              <h1
                id="codigo-guia"
                className="text-heading text-2xl font-semibold tracking-tight"
              >
                {restoration.code}
              </h1>
              {restoration.client ? (
                <p className="text-sm">
                  <Link
                    href={`/clientes/${restoration.client.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {restoration.client.name}
                  </Link>
                  {restoration.client.document ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {DOCUMENT_LABELS[restoration.client.document.type]}{" "}
                      {restoration.client.document.number}
                    </span>
                  ) : null}
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
              ) : null}
              <div className="flex flex-wrap gap-2">
                <span data-testid="estado-restauracion" className="contents">
                  <RestorationStatusBadge status={restoration.status} />
                </span>
                <RestorationKindBadge kind={kind} />
                {observed ? <ObservedBadge progress={observed} /> : null}
                {restoration.money && charged ? (
                  <PaymentStatusBadge
                    status={restoration.money.paymentStatus}
                    data-testid="estado-pago"
                  />
                ) : null}
                {restoration.shopifyOrderName && charged ? (
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
              </div>
              {/* Datos de la guía en texto: las insignias quedan para los estados. */}
              <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span data-testid="tipo-pago">
                  {kindNotice ?? PAYMENT_TYPE_LABELS[restoration.paymentType]}
                  {!charged
                    ? ""
                    : restoration.money?.depositAmountCents != null
                      ? ` (${formatCents(restoration.money.depositAmountCents)}${
                          restoration.money.depositPercent === null
                            ? ""
                            : ` · ${restoration.money.depositPercent} %`
                        })`
                      : restoration.money?.depositPercent
                        ? ` (${restoration.money.depositPercent} %)`
                        : ""}
                </span>
                <span aria-hidden>·</span>
                <span
                  data-testid="origen"
                  className="inline-flex items-center gap-1"
                >
                  {restoration.origin === "whatsapp" ? (
                    <WhatsAppIcon className="text-whatsapp-strong size-3.5" />
                  ) : null}
                  Origen: {RESTORATION_ORIGIN_LABELS[restoration.origin]}
                  {quote ? (
                    <>
                      {" · desde "}
                      <Link
                        href={`/cotizaciones-whatsapp/${restoration.whatsappQuoteId}`}
                        className="text-foreground underline underline-offset-4"
                      >
                        {quote}
                      </Link>
                    </>
                  ) : null}
                </span>
              </p>
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
                    notes: restoration.notes,
                  }}
                  contacts={editing.contacts}
                  hasPayments={payments.length > 0}
                  kind={kind}
                />
              ) : null}
              {editing ? (
                <ChangeRestorationKindButton
                  restorationId={restoration.id}
                  kind={kind}
                />
              ) : null}
              {canExportPdf ? (
                <GuidePdfButton
                  data={pdfData}
                  photos={photos}
                  clientId={restoration.client?.id ?? null}
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

          {restoration.money && !charged ? (
            <p className="border-t pt-4 text-sm" data-testid="sin-cobro">
              <span className="font-medium">Sin cobro</span>
              <span className="text-muted-foreground">
                {" "}
                · {kindNotice?.replace(/: sin cobro$/, "")} sin precios, pagos
                ni orden de Shopify.
              </span>
            </p>
          ) : restoration.money ? (
            <div className="space-y-1 border-t pt-4">
              <MoneySummary
                stackOnWide
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
            <div className="space-y-1 border-t pt-4">
              <p className="text-muted-foreground text-xs font-medium">
                Notas generales
              </p>
              <p className="text-sm whitespace-pre-line">{restoration.notes}</p>
            </div>
          ) : null}
        </section>

        <div className="min-w-0 space-y-6">
          {depositPending &&
          canSeeMoney &&
          restoration.money?.paidCents === 0 ? (
            <Notice tone="destructive">
              La restauración se registró, pero no se pudo registrar el
              adelanto. Regístralo desde Pagos.
            </Notice>
          ) : null}

          {photosPending ? (
            <Notice tone="destructive">
              No se pudieron copiar algunas fotos de la cotización de WhatsApp:
              súbelas desde Archivos.
            </Notice>
          ) : null}

          {restoration.money &&
          restoration.hasOrder &&
          restoration.money.paidCents > restoration.money.totalCents ? (
            <Notice tone="destructive">
              El cliente pagó{" "}
              {formatCents(
                restoration.money.paidCents - restoration.money.totalCents,
              )}{" "}
              más que el nuevo total: registra el reembolso (P12).
            </Notice>
          ) : null}

          {missingPrices ? (
            <Notice data-testid="faltan-precios">
              {missingPrices.message}
              {user.role === "admin"
                ? " Asígnalos en la columna «Precio venta» de cada pieza."
                : " Los asigna el administrador."}
            </Notice>
          ) : null}

          <UrlTabs initial="piezas" defaultValue={tab}>
            <TabsList>
              <TabsTrigger value="piezas">
                Piezas ({restoration.pieces.length})
              </TabsTrigger>
              {canSeeMoney && charged ? (
                <TabsTrigger value="pagos">Pagos</TabsTrigger>
              ) : null}
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
                      guideKind={kind}
                      editable={withoutPriceIfFree(editableFields(ctx).piece)}
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
                  guideKind={restoration.kind}
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
                  guideKind={restoration.kind}
                  hasOrder={restoration.hasOrder}
                  editing={
                    editing
                      ? {
                          editable: Object.fromEntries(
                            restoration.pieces.map((piece) => [
                              piece.id,
                              withoutPriceIfFree(
                                editableFields(ctx, piece).piece,
                              ),
                            ]),
                          ),
                          priceHint: !charged
                            ? `${kindNotice}: la pieza no lleva precio de venta.`
                            : can(user.role, "piezas.precio-venta")
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
            {canSeeMoney && charged ? (
              <TabsContent value="pagos" className="space-y-4">
                {money ? (
                  <div className="flex flex-wrap gap-2">
                    <RegisterPaymentDialog
                      restorationId={restoration.id}
                      // El adelanto puede superar el saldo mientras las piezas no tienen
                      // precio (total 0); la base acepta hasta lo que falte de él.
                      balanceCents={Math.max(
                        money.totalCents - money.paidCents,
                        money.expectedDepositCents - money.paidCents,
                      )}
                      suggested={suggested}
                      methods={paymentMethods}
                      branches={branches}
                    />
                    {can(user.role, "pagos.corregir") ? (
                      <RefundDialog
                        restorationId={restoration.id}
                        paidCents={money.paidCents}
                        methods={paymentMethods}
                        // Un pedido por pago: se elige qué pago se devuelve.
                        refundablePayments={
                          restoration.hasOrder
                            ? null
                            : payments
                                .filter(
                                  (p) =>
                                    p.kind === "pago" && p.refundableCents > 0,
                                )
                                .map((p) => ({
                                  id: p.id,
                                  label: `${p.orderTitle ?? p.orderName ?? "Pago"} · ${p.methodName}`,
                                  refundableCents: p.refundableCents,
                                }))
                        }
                      />
                    ) : null}
                    {can(user.role, "pagos.corregir") &&
                    (restoration.hasOrder || payments.length > 0) ? (
                      <ResyncPaymentsButton restorationId={restoration.id} />
                    ) : null}
                  </div>
                ) : null}
                <PaymentsList payments={payments} />
              </TabsContent>
            ) : null}
            <TabsContent value="archivos">
              <FilesPanel
                owner={{ kind: "restoration", id: restoration.id }}
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
                  <h2
                    id="cambios-estado"
                    className="text-heading font-semibold"
                  >
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
          </UrlTabs>
        </div>
      </div>
    </div>
  );
}

/** Catálogos y contactos de la empresa para los diálogos de edición. */
async function loadEditingData(client: { id: string; kind: string }) {
  const supabase = await createClient();
  const [materials, services, contacts] = await Promise.all([
    listCatalog("materials"),
    listCatalog("services"),
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
  // Con los desactivados: el buscador los muestra solo si la pieza ya los tiene.
  const option = ({
    id,
    name,
    price,
    active,
    isDefault,
  }: {
    id: string;
    name: string;
    price: number | null;
    active: boolean;
    isDefault?: boolean;
  }) => ({
    id,
    name,
    price,
    active,
    isDefault,
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
