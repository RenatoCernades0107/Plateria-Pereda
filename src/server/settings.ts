import "server-only";

import { cache } from "react";

import { DEFAULT_WHATSAPP_TEMPLATE } from "@/domain/whatsapp-template";
import { createClient } from "@/lib/supabase/server";

export const BRANDING_BUCKET = "branding";

export type Settings = {
  legalName: string;
  ruc: string | null;
  address: string;
  phones: string;
  email: string;
  logoPath: string | null;
  logoUrl: string | null;
  quoteValidityDays: number;
  depositPercent: number;
  /** Plantilla guardada; null si se usa la de la aplicación. */
  customWhatsappTemplate: string | null;
  /** Plantilla que se aplica (la guardada o la de la aplicación). */
  whatsappTemplate: string;
  terms: string;
};

/** Configuración de la empresa (una sola fila; la leen todos los usuarios). */
export const getSettings = cache(async (): Promise<Settings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error) throw error;

  return {
    legalName: data.legal_name,
    ruc: data.ruc,
    address: data.address,
    phones: data.phones,
    email: data.email,
    logoPath: data.logo_path,
    logoUrl: data.logo_path
      ? supabase.storage.from(BRANDING_BUCKET).getPublicUrl(data.logo_path).data
          .publicUrl
      : null,
    quoteValidityDays: data.quote_validity_days,
    depositPercent: Number(data.deposit_percent),
    customWhatsappTemplate: data.whatsapp_template,
    whatsappTemplate: data.whatsapp_template ?? DEFAULT_WHATSAPP_TEMPLATE,
    terms: data.terms,
  };
});
