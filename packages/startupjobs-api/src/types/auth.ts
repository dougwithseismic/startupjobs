import { z } from "zod";

export const LoginPayloadSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export type LoginPayload = z.infer<typeof LoginPayloadSchema>;

export const Login2faPayloadSchema = z.object({
  code: z.string(),
});

export type Login2faPayload = z.infer<typeof Login2faPayloadSchema>;

export const LoginStatusSchema = z.object({
  loggedIn: z.boolean(),
});

export type LoginStatus = z.infer<typeof LoginStatusSchema>;

export const RegisterPayloadSchema = z.object({
  email: z.string(),
  password: z.string(),
  name: z.string().optional(),
});

export type RegisterPayload = z.infer<typeof RegisterPayloadSchema>;

export const PasswordResetPayloadSchema = z.object({
  email: z.string(),
});

export type PasswordResetPayload = z.infer<typeof PasswordResetPayloadSchema>;

export const PasswordChangePayloadSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
});

export type PasswordChangePayload = z.infer<typeof PasswordChangePayloadSchema>;

export const OAuthConnectPayloadSchema = z.object({
  provider: z.string(),
  token: z.string(),
});

export type OAuthConnectPayload = z.infer<typeof OAuthConnectPayloadSchema>;
