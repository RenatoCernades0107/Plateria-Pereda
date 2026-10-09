"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { formatPhone } from "@/domain/phone";
import { contactSchema, type ContactFormInput } from "@/lib/validation/clients";
import { createContact, updateContact } from "@/server/clients/actions";
import type { ContactDetail } from "@/server/clients/queries";

import { DocumentTypeField, TextField } from "./form-fields";
import { PhoneField } from "./phone-field";

export type SavedContact = { id: string; displayName: string };

const EMPTY: ContactFormInput = {
  firstName: "",
  lastName: "",
  position: "",
  document: { documentType: null, documentNumber: "" },
  phone: "",
  email: "",
};

export function contactDefaults(contact: ContactDetail): ContactFormInput {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    position: contact.position,
    document: {
      documentType: contact.documentType,
      documentNumber: contact.documentNumber ?? "",
    },
    phone: contact.phone ? formatPhone(contact.phone) : "",
    email: contact.email ?? "",
  };
}

function ContactForm({
  clientId,
  contact,
  onSaved,
}: {
  clientId: string;
  contact?: ContactDetail;
  onSaved: (saved: SavedContact) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<ContactFormInput>({
    resolver: zodResolver(contactSchema as never),
    defaultValues: contact ? contactDefaults(contact) : EMPTY,
  });

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    const input = form.getValues();
    startTransition(async () => {
      if (contact) {
        const result = await updateContact(contact.id, input);
        if ("error" in result) return setError(result.error);
        onSaved({ id: contact.id, displayName: contact.displayName });
      } else {
        const result = await createContact(clientId, input);
        if ("error" in result) return setError(result.error);
        onSaved({ id: result.id, displayName: result.displayName });
      }
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="firstName" label="Nombres" />
          <TextField form={form} name="lastName" label="Apellidos" />
          <div className="sm:col-span-2">
            <TextField form={form} name="position" label="Cargo" />
          </div>
          <DocumentTypeField form={form} name="document.documentType" />
          <TextField
            form={form}
            name="document.documentNumber"
            label="Número de documento"
          />
          <PhoneField form={form} name="phone" />
          <TextField
            form={form}
            name="email"
            label="Email"
            type="email"
            inputMode="email"
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Guardando…"
              : contact
                ? "Guardar cambios"
                : "Agregar contacto"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

/**
 * Alta o edición de un contacto de una empresa. Se reutiliza desde el formulario de
 * restauraciones: `onSaved` recibe el contacto guardado.
 */
export function ContactDialog({
  clientId,
  companyName,
  contact,
  trigger,
  onSaved,
}: {
  clientId: string;
  companyName: string;
  contact?: ContactDetail;
  trigger?: React.ReactNode;
  onSaved?: (saved: SavedContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleSaved = (saved: SavedContact) => {
    toast.success(
      contact
        ? "Contacto actualizado."
        : `Se agregó a ${saved.displayName} como contacto. Se está enviando a Shopify.`,
    );
    setOpen(false);
    onSaved?.(saved);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <UserPlus />
            Agregar contacto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {contact ? `Editar ${contact.displayName}` : "Nuevo contacto"}
          </DialogTitle>
          <DialogDescription>
            {contact
              ? "Los cambios de nombre, teléfono y email también se guardan en Shopify."
              : `Persona de ${companyName} que puede dejar o recoger piezas. Se crea también en Shopify.`}
          </DialogDescription>
        </DialogHeader>
        <ContactForm
          clientId={clientId}
          contact={contact}
          onSaved={handleSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
