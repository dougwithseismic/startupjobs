import { z } from "zod";
import { LocalizedStringSchema } from "./common.js";

// --- Languages (confirmed on .cz) ---

export const LanguageTagSchema = z.object({
  identifier: z.number(),
  urlIdentifier: z.string(),
  name: z.string(),
  category: z.string(),
  universalIdentifier: z.string(),
  readonly: z.boolean(),
  hint: z.object({
    text: z.string(),
    associatedVueComponent: z.string(),
  }),
  children: z.array(z.unknown()),
  icon: z.string().nullable(),
  isBypassingUrl: z.boolean(),
  taggable: z.boolean(),
  tooltip: z.string().nullable(),
  offer_count: z.number().nullable(),
  group: z.number(),
  synonym: z.string().nullable(),
});

export type LanguageTag = z.infer<typeof LanguageTagSchema>;

// --- Below types are from chunk analysis, not yet confirmed accessible ---

export const DisciplineSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  slug: z.string(),
});

export type Discipline = z.infer<typeof DisciplineSchema>;

export const FieldSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  slug: z.string(),
});

export type Field = z.infer<typeof FieldSchema>;

export const PositionSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
  slug: z.string(),
});

export type Position = z.infer<typeof PositionSchema>;

export const SchoolSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type School = z.infer<typeof SchoolSchema>;

export const SkillRefSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
});

export type SkillRef = z.infer<typeof SkillRefSchema>;

export const WorkplaceSchema = z.object({
  id: z.number(),
  name: LocalizedStringSchema,
});

export type Workplace = z.infer<typeof WorkplaceSchema>;

export const LocationHintSchema = z.object({
  placeId: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export type LocationHint = z.infer<typeof LocationHintSchema>;
