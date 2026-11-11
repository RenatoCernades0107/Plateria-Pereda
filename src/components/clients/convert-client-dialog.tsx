"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Notice } from "@/components/notice";
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
import type { CompanyFormInput } from "@/lib/validation/clients";
import { convertClientToCompany } from "@/server/clients/actions";
import type { ClientDetail } from "@/server/clients/queries";

import { companyDefaults } from "./edit-client-dialog";
import { CompanyForm, type SaveClient } from "./new-client-dialog";

/** Los datos de la persona que sirven a la empresa (teléfono, email, dirección y notas). */
function defaults(client: ClientDetail): CompanyFormInput {
  const base = companyDefaults(client);
  const phone = client.phone ?? client.contactPhone;
  return {
    ...base,
    legalName: "",
    ruc: "",
    // Una persona no tiene sede: como en el alta de una empresa, Lima.
    city: client.city || "Lima",
    phone: phone ? formatPhone(phone) : "",
  };
}

/**
 * Convierte una persona en empresa (solo admin). Sus guías y cotizaciones siguen con el
 * cliente. La persona puede quedarse como contacto de la empresa (en Shopify, su
 * Customer se asigna a la Company) o no (su Customer queda en Shopify sin vínculo).
 */
export function ConvertClientDialog({ client }: { client: ClientDetail }) {
  const [open, setOpen] = useState(false);
  const [keepAsContact, setKeepAsContact] = useState(true);

  const change = (value: boolean) => {
    setOpen(value);
    if (!value) setKeepAsContact(true);
  };

  const save: SaveClient = async (input) => {
    if (input.kind !== "empresa") return "Revisa los datos ingresados.";
    const result = await convertClientToCompany(client.id, {
      company: input,
      keepAsContact,
    });
    if ("error" in result) return result.error;
    toast.success(
      result.keptAsContact
        ? `${client.displayName} ahora es una empresa y queda como su contacto.`
        : result.hadShopifyCustomer
          ? `${client.displayName} ahora es una empresa. Su cliente de Shopify se borrará si no tiene pedidos.`
          : `${client.displayName} ahora es una empresa.`,
    );
    change(false);
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Building2 />
          Convertir en empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Convertir {client.displayName} en empresa</DialogTitle>
          <DialogDescription>
            Sus guías, cotizaciones y pagos pasan a la empresa. En Shopify se
            crea la empresa (Company). Este cambio no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            ¿Qué pasa con {client.displayName}?
          </legend>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="keep-as-contact"
              className="accent-primary mt-0.5 size-4 shrink-0"
              checked={keepAsContact}
              onChange={() => setKeepAsContact(true)}
            />
            <span>
              Queda como contacto de la empresa (en Shopify, su cliente pasa a
              ser contacto de la empresa, con su historial).
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="keep-as-contact"
              className="accent-primary mt-0.5 size-4 shrink-0"
              checked={!keepAsContact}
              onChange={() => setKeepAsContact(false)}
            />
            <span>
              No la conservo (su cliente se borra de Shopify si no tiene
              pedidos; si los tiene, queda allí con su historial, sin vínculo
              con el sistema).
            </span>
          </label>
        </fieldset>

        <Notice>
          Las órdenes que ya están en Shopify siguen a nombre de la persona; los
          pagos nuevos se registran a nombre de la empresa.
          {keepAsContact
            ? null
            : " Agrega un contacto a la empresa antes de registrar un pago: sin contacto, Shopify no crea la orden."}
        </Notice>

        <CompanyForm
          save={save}
          defaults={defaults(client)}
          submitLabel="Convertir en empresa"
          resetAfterSave={false}
        />
      </DialogContent>
    </Dialog>
  );
}
