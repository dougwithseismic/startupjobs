import { z } from "zod";
import {
  FacetBucketSchema,
  JsonLdMetaSchema,
  LocalizedStringSchema,
} from "./common.js";

// --- Search Offers ---

export const SearchOfferCompanySchema = z.object({
  "@type": z.literal("SearchOfferCompany"),
  "@id": z.string(),
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  isStartup: z.boolean(),
});

export const SearchOfferSchema = z.object({
  "@id": z.string(),
  "@type": z.literal("SearchOffer"),
  id: z.string(),
  displayId: z.number(),
  kind: z.string(),
  company: SearchOfferCompanySchema,
  contract: z.array(z.string()),
  seniority: z.array(z.string()),
  title: LocalizedStringSchema,
  description: LocalizedStringSchema,
});

export const SearchOffersResponseSchema = JsonLdMetaSchema.extend({
  totalItems: z.number(),
  member: z.array(SearchOfferSchema),
});

export type SearchOffer = z.infer<typeof SearchOfferSchema>;
export type SearchOfferCompany = z.infer<typeof SearchOfferCompanySchema>;
export type SearchOffersResponse = z.infer<typeof SearchOffersResponseSchema>;

export const SearchOffersParamsSchema = z.object({
  page: z.number().optional(),
  itemsPerPage: z.number().optional(),
  startupOnly: z.boolean().optional(),
  seniority: z.array(z.string()).optional(),
  locationPreference: z.array(z.string()).optional(),
  id: z.array(z.string()).optional(),
});

export type SearchOffersParams = z.infer<typeof SearchOffersParamsSchema>;

// --- Facets ---

export const SeniorityFacetResponseSchema = JsonLdMetaSchema.extend({
  seniorities: z.array(FacetBucketSchema),
});

export const LocationBucketSchema = z.object({
  "@type": z.literal("LocationBucket"),
  "@id": z.string(),
  key: z.string(),
  name: LocalizedStringSchema,
  count: z.number(),
  lat: z.number(),
  lng: z.number(),
});

export const LocationFacetResponseSchema = JsonLdMetaSchema.extend({
  locations: z.array(LocationBucketSchema),
});

export const SkillBucketSchema = FacetBucketSchema.extend({
  name: z.string(),
  id: z.string(),
});

export const SkillFacetResponseSchema = JsonLdMetaSchema.extend({
  skills: z.array(SkillBucketSchema),
});

export const FieldBucketSchema = z.object({
  key: z.string(),
  doc_count: z.number(),
});

export const FieldFacetResponseSchema = JsonLdMetaSchema.extend({
  fields: z.array(FieldBucketSchema),
});

export type SeniorityFacetResponse = z.infer<
  typeof SeniorityFacetResponseSchema
>;
export type LocationBucket = z.infer<typeof LocationBucketSchema>;
export type LocationFacetResponse = z.infer<typeof LocationFacetResponseSchema>;
export type SkillBucket = z.infer<typeof SkillBucketSchema>;
export type SkillFacetResponse = z.infer<typeof SkillFacetResponseSchema>;
export type FieldBucket = z.infer<typeof FieldBucketSchema>;
export type FieldFacetResponse = z.infer<typeof FieldFacetResponseSchema>;

export const FacetsParamsSchema = z.object({
  startupOnly: z.boolean().optional(),
  seniority: z.array(z.string()).optional(),
});

export type FacetsParams = z.infer<typeof FacetsParamsSchema>;
