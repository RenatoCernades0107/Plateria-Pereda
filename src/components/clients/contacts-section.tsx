import { Pencil, Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ShopifyIcon } from "@/components/icons/shopify-icon";
import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { EDIT_ICON_CLASS } from "@/components/icons/icon-colors";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";
import type { ClientDetail } from "@/server/clients/queries";

import { ActiveToggle } from "./active-toggle";
import { ContactDialog } from "./contact-dialog";

type Contact = ClientDetail["contacts"][number];

const NONE = <span className="text-muted-foreground">—</span>;

function Name({ contact }: { contact: Contact }) {
  return (
    <span className="text-heading flex flex-wrap items-center gap-2 font-medium">
      {contact.displayName}
      {contact.active ? null : <Badge variant="outline">Inactivo</Badge>}
    </span>
  );
}

function Document({ contact }: { contact: Contact }) {
  return contact.documentType ? (
    <span>
      {DOCUMENT_LABELS[contact.documentType]} {contact.documentNumber}
    </span>
  ) : null;
}

function Sync({ contact, canRetry }: { contact: Contact; canRetry: boolean }) {
  return contact.sync ? (
    <SyncStatus
      jobId={contact.sync.jobId}
      status={contact.sync.status}
      lastError={contact.sync.lastError}
      canRetry={canRetry}
    />
  ) : null;
}

function ContactActions({
  client,
  contact,
}: {
  client: ClientDetail;
  contact: Contact;
}) {
  return (
    <div className="flex shrink-0 gap-2 md:justify-end">
      <ContactDialog
        clientId={client.id}
        companyName={client.displayName}
        contact={contact}
        trigger={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`Editar ${contact.displayName}`}
          >
            <Pencil className={EDIT_ICON_CLASS} />
          </Button>
        }
      />
      <ActiveToggle
        entity="contact"
        id={contact.id}
        name={contact.displayName}
        active={contact.active}
      />
    </div>
  );
}

/**
 * Contactos de una empresa: quiénes dejan o recogen piezas a su nombre. En tabla en
 * la computadora (como una hoja de cálculo, D63) y en tarjetas en el celular.
 */
export function ContactsSection({
  client,
  canEdit,
}: {
  client: ClientDetail;
  canEdit: boolean;
}) {
  return (
    <section className="space-y-3" aria-labelledby="contactos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="contactos" className="text-heading text-lg font-semibold">
          Contactos
        </h2>
        {canEdit ? (
          <ContactDialog
            clientId={client.id}
            companyName={client.displayName}
          />
        ) : null}
      </div>
      {client.contacts.length === 0 ? (
        <EmptyState>
          <Users className="mx-auto mb-2 size-5" aria-hidden />
          Esta empresa aún no tiene contactos.
        </EmptyState>
      ) : (
        <>
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1.5">
                      <ShopifyIcon className="text-shopify-strong size-4" />
                      Shopify
                    </span>
                  </TableHead>
                  {canEdit ? (
                    <TableHead className="text-right">Acciones</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.contacts.map((k) => (
                  <TableRow
                    key={k.id}
                    data-testid={`contacto-${k.displayName}`}
                  >
                    <TableCell>
                      <Name contact={k} />
                    </TableCell>
                    <TableCell>{k.position || NONE}</TableCell>
                    <TableCell>
                      {k.documentType ? <Document contact={k} /> : NONE}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {k.phone ? formatPhone(k.phone) : NONE}
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      {k.email || NONE}
                    </TableCell>
                    <TableCell>
                      {k.sync ? <Sync contact={k} canRetry={canEdit} /> : NONE}
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <ContactActions client={client} contact={k} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul
            className="divide-y rounded-md border md:hidden"
            aria-label="Contactos"
          >
            {client.contacts.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
                data-testid={`contacto-movil-${k.displayName}`}
              >
                <div className="min-w-0 space-y-1">
                  <Name contact={k} />
                  <div className="text-muted-foreground space-y-0.5 text-sm">
                    {k.position ? <p>{k.position}</p> : null}
                    {k.documentType ? (
                      <p>
                        <Document contact={k} />
                      </p>
                    ) : null}
                    {k.phone ? <p>{formatPhone(k.phone)}</p> : null}
                    {k.email ? <p className="truncate">{k.email}</p> : null}
                  </div>
                  <Sync contact={k} canRetry={canEdit} />
                </div>
                {canEdit ? (
                  <ContactActions client={client} contact={k} />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
