"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ContactDialog } from "@/components/clients/contact-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClientOption } from "@/domain/client-search";
import { formatPhone } from "@/domain/phone";
import {
  listCompanyContacts,
  type CompanyContacts,
} from "@/server/clients/search-actions";

/** Valor del selector para cotizar a la empresa sin un contacto. */
const NO_CONTACT = "sin-contacto";

/** Id de la empresa si la opción es una empresa o uno de sus contactos. */
export function companyIdOf(client: ClientOption | null): string | null {
  if (client?.source !== "local") return null;
  if (client.kind === "empresa" || client.kind === "contacto") {
    return client.clientId;
  }
  return null;
}

function contactLabel(option: ClientOption): string {
  return option.phone
    ? `${option.name} · ${formatPhone(option.phone)}`
    : option.name;
}

/**
 * Tras elegir una empresa en la cotización: a cuál de sus contactos se dirige (o a
 * ninguno) y, para quien puede registrar clientes, «Nuevo contacto» para crearlo ahí
 * mismo y dejarlo elegido.
 */
export function CompanyContactPicker({
  client,
  canCreate = false,
  onChange,
}: {
  /** Empresa o contacto de empresa elegido en el buscador. */
  client: ClientOption;
  canCreate?: boolean;
  onChange: (client: ClientOption) => void;
}) {
  const companyId = companyIdOf(client);
  const [data, setData] = useState<CompanyContacts | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    listCompanyContacts(companyId)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setLoadedFor(companyId);
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudieron cargar los contactos.");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reload]);

  if (!companyId) return null;
  const loading = loadedFor !== companyId;
  const loaded = loading ? [] : (data?.contacts ?? []);
  const company = loading ? null : (data?.company ?? null);
  const selected =
    client.source === "local" && client.kind === "contacto"
      ? client.contactId
      : NO_CONTACT;
  const companyName =
    client.source === "local" && client.kind === "contacto"
      ? client.companyName
      : client.name;

  // Un contacto ya elegido que ya no está activo se sigue mostrando.
  const contacts =
    loading ||
    selected === NO_CONTACT ||
    loaded.some(
      (k) =>
        k.source === "local" &&
        k.kind === "contacto" &&
        k.contactId === selected,
    )
      ? loaded
      : [client, ...loaded];

  const choose = (value: string) => {
    if (value === NO_CONTACT) {
      if (company) onChange(company);
      return;
    }
    const contact = contacts.find(
      (k) =>
        k.source === "local" && k.kind === "contacto" && k.contactId === value,
    );
    if (contact) onChange(contact);
  };

  // Al crear un contacto se recarga la lista y se elige el nuevo.
  const created = async (id: string) => {
    try {
      const result = await listCompanyContacts(companyId);
      setData(result);
      setLoadedFor(companyId);
      const contact = result?.contacts.find(
        (k) =>
          k.source === "local" && k.kind === "contacto" && k.contactId === id,
      );
      if (contact) onChange(contact);
    } catch {
      setReload((n) => n + 1);
    }
  };

  return (
    <div className="space-y-1.5" data-testid="contacto-empresa">
      <Label htmlFor="cotizacion-contacto">Contacto de {companyName}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected} disabled={loading} onValueChange={choose}>
          <SelectTrigger id="cotizacion-contacto" className="min-w-56 flex-1">
            {loading ? (
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Cargando contactos…
              </span>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CONTACT}>
              Sin contacto (a la empresa)
            </SelectItem>
            {contacts.map((k) =>
              k.source === "local" && k.kind === "contacto" ? (
                <SelectItem key={k.contactId} value={k.contactId}>
                  {contactLabel(k)}
                </SelectItem>
              ) : null,
            )}
          </SelectContent>
        </Select>
        {canCreate ? (
          <ContactDialog
            clientId={companyId}
            companyName={companyName}
            onSaved={(saved) => void created(saved.id)}
            trigger={
              <Button type="button" variant="outline" size="sm">
                <UserPlus aria-hidden />
                Nuevo contacto
              </Button>
            }
          />
        ) : null}
      </div>
      {!loading && contacts.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          La empresa no tiene contactos registrados.
        </p>
      ) : null}
    </div>
  );
}
