import { z } from "zod";
import { PaginatorSchema } from "./offers.js";

// --- Homepage Companies (/api/homepage-data/companies) ---

export const HomepageCompanySchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  area: z.string(),
  logoImage: z.string(),
  coverImage: z.string(),
  introduction: z.string(),
  offerCount: z.number(),
  isStartup: z.number(),
  is_gold: z.number(),
});

export type HomepageCompany = z.infer<typeof HomepageCompanySchema>;

// --- Paginated Companies (/api/companies) ---

export const CompanyListItemSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  offersCount: z.number(),
  video: z.boolean(),
  isGold: z.number(),
  logo: z.string(),
  cover: z.string(),
  location: z.string(),
  goldOrder: z.number(),
  isFollowedByUser: z.number(),
});

export type CompanyListItem = z.infer<typeof CompanyListItemSchema>;

export const CompanyListResponseSchema = z.object({
  resultSet: z.array(CompanyListItemSchema),
  paginator: PaginatorSchema,
});

export type CompanyListResponse = z.infer<typeof CompanyListResponseSchema>;
