import { z } from "zod";

const text = (max: number) =>
  z.string().trim().max(max, `Máximo ${max} caracteres`);

export const phoneSchema = text(30).regex(
  /^[\d\s+()-]*$/,
  "Usa solo números, espacios, +, - y paréntesis",
);

export const workshopSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Ingresa el nombre del taller")
    .max(100, "Máximo 100 caracteres"),
  contactName: text(100),
  phone: phoneSchema,
  address: text(300),
  notes: text(2000),
});

export type WorkshopInput = z.infer<typeof workshopSchema>;
