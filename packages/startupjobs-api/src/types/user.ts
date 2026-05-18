import { z } from "zod";
import { LocalizedStringSchema } from "./common.js";

export const UserContactsSchema = z.object({
  phone: z.string().nullable(),
  phonePrefix: z.string().nullable(),
  twitter: z.string().nullable(),
  facebook: z.string().nullable(),
  linkedin: z.string().nullable(),
  instagram: z.string().nullable(),
  googleplus: z.string().nullable(),
});

export const UserPortfolioSchema = z.object({
  github: z.array(z.string()),
  websites: z.array(z.string()),
});

export const SeniorityInfoSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
});

export const CollaborationSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  type: z.string(),
});

export const LocationInfoSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  placeId: z.string(),
});

export const SalarySchema = z.object({
  id: z.number(),
  currency: z.string(),
  measure: z.string(),
  minimum: z.number(),
  maximum: z.number(),
});

export const UserInfoSchema = z.object({
  seniorities: z.array(SeniorityInfoSchema),
  collaborations: z.array(CollaborationSchema),
  shifts: z.array(z.number()),
  locations: z.array(LocationInfoSchema),
  salary: SalarySchema.nullable(),
});

export const SkillItemSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
});

export const UserSkillsSchema = z.object({
  required: z.array(SkillItemSchema),
  niceToHave: z.array(SkillItemSchema),
});

export const AreaSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  slug: LocalizedStringSchema,
});

export const EmploymentSchema = z.object({
  id: z.number(),
  company: z.string(),
  position: LocalizedStringSchema,
  summary: z.string().nullable(),
  from: z.string(),
  until: z.string().nullable(),
  skills: z.array(z.unknown()),
  skills2: z.array(z.unknown()),
});

export const UserProfileSchema = z.object({
  id: z.number(),
  userId: z.number(),
  username: z.string(),
  completenessScore: z.number(),
  gdprAgreement: z.boolean(),
  availability: z.string(),
  profilePictureUrl: z.string().nullable(),
  name: z.string(),
  whoAmI: z.string().nullable(),
  aboutMe: LocalizedStringSchema,
  gender: z.string().nullable(),
  reasonToWork: z.string().nullable(),
  contacts: UserContactsSchema,
  portfolio: UserPortfolioSchema,
  info: UserInfoSchema,
  skills: UserSkillsSchema,
  isVerified: z.boolean(),
  areas: z.array(AreaSchema),
  employments: z.array(EmploymentSchema),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserContacts = z.infer<typeof UserContactsSchema>;

export const UserSettingsSchema = z.object({
  twoFactor: z.boolean(),
  isAdmin: z.boolean(),
  isImpersonator: z.boolean(),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const IntercomConfigSchema = z.object({
  app_id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  user_hash: z.string().nullable(),
  created_at: z.string().nullable(),
  vokal: z.string().nullable(),
});

export type IntercomConfig = z.infer<typeof IntercomConfigSchema>;
