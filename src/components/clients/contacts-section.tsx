import { Pencil, Users } from "lucide-react";

import { SyncStatus } from "@/components/shopify/sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOCUMENT_LABELS } from "@/domain/documents";
import { formatPhone } from "@/domain/phone";
import type { ClientDetail } from "@/server/clients/queries";

import { ActiveToggle } from "./active-toggle";
import { ContactDialog } from "./contact-dialog";

/** Contactos de una empresa: quiénes dejan o recogen piezas a su nombre. */
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
        <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          <Users className="mx-auto mb-2 size-5" aria-hidden />
          Esta empresa aún no tiene contactos.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {client.contacts.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-start justify-between gap-3 p-4"
              data-testid={`contacto-${k.displayName}`}
            >
              <div className="min-w-0 space-y-1">
                <p className="text-heading flex flex-wrap items-center gap-2 font-medium">
                  {k.displayName}
                  {k.active ? null : <Badge variant="outline">Inactivo</Badge>}
                </p>
                <div className="text-muted-foreground space-y-0.5 text-sm">
                  {k.position ? <p>{k.position}</p> : null}
                  {k.documentType ? (
                    <p>
                      {DOCUMENT_LABELS[k.documentType]} {k.documentNumber}
                    </p>
                  ) : null}
                  {k.phone ? <p>{formatPhone(k.phone)}</p> : null}
                  {k.email ? <p className="truncate">{k.email}</p> : null}
                </div>
                {k.sync ? (
                  <SyncStatus
                    jobId={k.sync.jobId}
                    status={k.sync.status}
                    lastError={k.sync.lastError}
                    canRetry={canEdit}
                  />
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-2">
                  <ContactDialog
                    clientId={client.id}
                    companyName={client.displayName}
                    contact={k}
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${k.displayName}`}
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                  <ActiveToggle
                    entity="contact"
                    id={k.id}
                    name={k.displayName}
                    active={k.active}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
