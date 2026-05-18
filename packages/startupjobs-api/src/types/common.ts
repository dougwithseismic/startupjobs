import { z } from "zod";

export const LocalizedStringSchema = z.object({
  cs: z.string(),
  en: z.string().nullable(),
});

export type LocalizedString = z.infer<typeof LocalizedStringSchema>;

export const JsonLdMetaSchema = z.object({
  "@context": z.string(),
  "@id": z.string(),
  "@type": z.string(),
});

export const FacetBucketSchema = z.object({
  "@type": z.literal("FacetBucket"),
  "@id": z.string(),
  key: z.string(),
  count: z.number(),
});

export type FacetBucket = z.infer<typeof FacetBucketSchema>;

export const PaginationParams = z.object({
  page: z.number().optional(),
  itemsPerPage: z.number().optional(),
});

export type PaginationParams = z.infer<typeof PaginationParams>;
