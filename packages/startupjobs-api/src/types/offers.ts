import { z } from "zod";
import { LocalizedStringSchema } from "./common.js";

// --- Paginated Offers List (/api/offers) ---

export const PaginatorSchema = z.object({
  current: z.number(),
  max: z.number(),
});

export type Paginator = z.infer<typeof PaginatorSchema>;

export const OfferListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  company: z.string(),
  companyType: z.string(),
  mainAreaName: z.string(),
  imageUrl: z.string(),
  locations: z.string(),
  shifts: z.string(),
  areaSlugs: z.array(z.string()),
  areaNames: z.array(z.string()),
  seniorities: z.array(z.string()),
  benefits: z.array(z.number()),
  collaborations: z.string(),
  isHot: z.boolean(),
  isRemote: z.boolean(),
  hasUserSeen: z.boolean(),
  hasUserLiked: z.boolean(),
  hasUserApplied: z.boolean(),
  isTop: z.boolean(),
  isImported: z.boolean(),
  coverImageUrl: z.string().nullable(),
  companyAreas: z.array(z.string()),
  isStartup: z.boolean(),
  salary: z.unknown().nullable(),
});

export type OfferListItem = z.infer<typeof OfferListItemSchema>;

export const OfferListResponseSchema = z.object({
  resultSet: z.array(OfferListItemSchema),
  resultCount: z.number(),
  paginator: PaginatorSchema,
  permanentUrlForResultSet: z.string().optional(),
  seo: z.unknown().optional(),
});

export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;

// --- Offer Detail (/api/front/offer/{id}) ---

export const OfferDetailSchema = z.object({
  status: z.string(),
  createdAt: z.string(),
  cvRequired: z.boolean(),
  slug: z.string(),
  name: LocalizedStringSchema,
  description: LocalizedStringSchema,
});

export type OfferDetail = z.infer<typeof OfferDetailSchema>;

// --- Recommendations ---

export const OfferRecommendationItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
});

export const OfferRecommendationsResponseSchema = z.object({
  data: z.array(OfferRecommendationItemSchema),
});

export type OfferRecommendationItem = z.infer<
  typeof OfferRecommendationItemSchema
>;
export type OfferRecommendationsResponse = z.infer<
  typeof OfferRecommendationsResponseSchema
>;

// --- Application ---

export const ApplicationPayloadSchema = z.object({
  email: z.string(),
  name: z.string(),
  phone: z.string(),
  phonePrefix: z.string(),
  linkedin: z.string().optional(),
  registerAccount: z.boolean(),
  userFiles: z.array(z.string()),
  why: z.string(),
  attachments: z.array(z.string()),
  formOpenedAt: z.string(),
  device: z.string(),
});

export type ApplicationPayload = z.infer<typeof ApplicationPayloadSchema>;

export const ApplicationResponseSchema = z.object({
  application_hash: z.string(),
  application_id: z.number(),
});

export type ApplicationResponse = z.infer<typeof ApplicationResponseSchema>;

export const FileUploadResponseSchema = z.object({
  name: z.string(),
  originalName: z.string(),
});

export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;

// --- Job Alerts ---

export const JobAlertTagSchema = LocalizedStringSchema;

export const JobAlertParamsSchema = z.object({
  "fields[]": z.array(z.string()),
  "skills[]": z.array(z.string()),
  "benefits[]": z.array(z.string()),
  "contract[]": z.array(z.string()),
  "fulltext[]": z.array(z.string()),
  "companies[]": z.array(z.string()),
  "languages[]": z.array(z.string()),
  "locations[]": z.array(z.string()),
  "seniority[]": z.array(z.string()),
  startupOnly: z.boolean(),
  "employmentType[]": z.array(z.string()),
  "locationPreference[]": z.array(z.string()),
});

export const JobAlertSchema = z.object({
  id: z.number(),
  userId: z.string(),
  enabled: z.boolean(),
  tags: z.array(JobAlertTagSchema),
  adaptedParams: JobAlertParamsSchema,
});

export const JobAlertsResponseSchema = z.object({
  frequency: z.string(),
  alerts: z.array(JobAlertSchema),
});

export type JobAlert = z.infer<typeof JobAlertSchema>;
export type JobAlertsResponse = z.infer<typeof JobAlertsResponseSchema>;

// --- Newsletter Settings ---

export const NewsletterSettingsSchema = z.object({
  frequency: z.string(),
  general: z.boolean(),
  personalized: z.boolean(),
  quizzes: z.boolean(),
  research: z.boolean(),
  careerTips: z.boolean(),
  feedback: z.boolean(),
  companyNews: z.boolean(),
});

export type NewsletterSettings = z.infer<typeof NewsletterSettingsSchema>;
