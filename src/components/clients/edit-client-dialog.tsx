"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPhone } from "@/domain/phone";
import { DEFAULT_REGION } from "@/domain/regions";
import type {
  CompanyFormInput,
  PersonFormInput,
} from "@/lib/validation/clients";
import { updateClient } from "@/server/clients/actions";
import type { ClientDetail } from "@/server/clients/queries";

import { CompanyForm, PersonForm, type SaveClient } from "./new-client-dialog";

const common = (client: ClientDetail) => ({
  phone: client.phone ? formatPhone(client.phone) : "",
  email: client.email ?? "",
  address: client.address,
  notes: client.notes,
});

export function personDefaults(client: ClientDetail): PersonFormInput {
  return {
    kind: "persona",
    firstName: client.firstName,
    lastName: client.lastName,
    document: {
      documentType: client.documentType === "ruc" ? null : client.documentType,
      documentNumber: client.documentNumber ?? "",
    },
    ...common(client),
  };
}

export function companyDefaults(client: ClientDetail): CompanyFormInput {
  return {
    kind: "empresa",
    legalName: client.legalName,
    ruc: client.documentNumber ?? "",
    city: client.city,
    region: (client.region ?? DEFAULT_REGION) as CompanyFormInput["region"],
    ...common(client),
  };
}

/** Edición de los datos de un cliente; si ya está en Shopify, se actualiza ahí (P16). */
export function EditClientDialog({ client }: { client: ClientDetail }) {
  const [open, setOpen] = useState(false);
  const save: SaveClient = async (input) => {
    const result = await updateClient(client.id, input);
    if ("error" in result) return result.error;
    toast.success(
      client.sync
        ? "Cambios guardados. Se actualizarán en Shopify."
        : "Cambios guardados.",
    );
    setOpen(false);
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar {client.displayName}</DialogTitle>
          <DialogDescription>
            Los cambios de nombre, documento, teléfono, email y dirección
            también se guardan en Shopify.
          </DialogDescription>
        </DialogHeader>
        {client.kind === "persona" ? (
          <PersonForm
            save={save}
            defaults={personDefaults(client)}
            submitLabel="Guardar cambios"
            resetAfterSave={false}
          />
        ) : (
          <CompanyForm
            save={save}
            defaults={companyDefaults(client)}
            submitLabel="Guardar cambios"
            resetAfterSave={false}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
