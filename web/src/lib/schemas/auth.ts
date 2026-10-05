import { z } from "zod";

import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth-constants";

export { PASSWORD_MAX, PASSWORD_MIN };

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Enter a valid email address." }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, "That password is too long.");

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Enter your current password.").max(PASSWORD_MAX),
  new_password: passwordSchema,
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm.").max(PASSWORD_MAX),
  confirm: z.literal("DELETE", { message: 'Type DELETE to confirm.' }),
});
