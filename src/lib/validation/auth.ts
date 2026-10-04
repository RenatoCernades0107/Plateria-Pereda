import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Ingresa un email válido"));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const recoverPasswordSchema = z.object({ email });
export type RecoverPasswordInput = z.infer<typeof recoverPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
