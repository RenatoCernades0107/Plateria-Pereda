/** Cómo se guarda en el sistema un cliente que viene de Shopify (persona). */

const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ShopifyCustomerData = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  note: string;
};

export type ImportedPerson = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string;
};

const clean = (value: string | null | undefined, max: number) =>
  (value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/**
 * Una persona necesita nombres: si Shopify no los tiene se usan los apellidos, la
 * parte local del email o el teléfono. Email y teléfono inválidos se descartan (el
 * sistema exige email válido y teléfono E.164).
 */
export function personFromShopify(
  customer: ShopifyCustomerData,
): ImportedPerson {
  const first = clean(customer.firstName, 100);
  const last = clean(customer.lastName, 100);
  const email = clean(customer.email, 254).toLowerCase();
  const phone = clean(customer.phone, 20);
  const validEmail = EMAIL.test(email) ? email : null;
  const validPhone = E164.test(phone) ? phone : null;
  return {
    firstName:
      first ||
      last ||
      validEmail?.split("@")[0]?.slice(0, 100) ||
      validPhone ||
      "Cliente de Shopify",
    lastName: first ? last : "",
    email: validEmail,
    phone: validPhone,
    notes: (customer.note ?? "").trim().slice(0, 2000),
  };
}
