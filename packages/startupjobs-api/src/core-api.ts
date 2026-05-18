import { HttpClient } from "./http.js";
import type {
  FacetsParams,
  FieldFacetResponse,
  LocationFacetResponse,
  SearchOffersParams,
  SearchOffersResponse,
  SeniorityFacetResponse,
  SkillFacetResponse,
} from "./types/index.js";

const ACCEPT_JSONLD = "application/ld+json";

export class CoreApi {
  constructor(private http: HttpClient) {}

  async searchOffers(
    params?: SearchOffersParams,
  ): Promise<SearchOffersResponse> {
    return this.http.get("/api/search/offers", {
      params: params as Record<string, unknown>,
      accept: ACCEPT_JSONLD,
    });
  }

  async facetsSeniority(
    params?: FacetsParams,
  ): Promise<SeniorityFacetResponse> {
    return this.http.get("/api/facets/offers/seniority", {
      params: params as Record<string, unknown>,
      accept: ACCEPT_JSONLD,
    });
  }

  async facetsLocation(params?: FacetsParams): Promise<LocationFacetResponse> {
    return this.http.get("/api/facets/offers/location", {
      params: params as Record<string, unknown>,
      accept: ACCEPT_JSONLD,
    });
  }

  async facetsSkill(params?: FacetsParams): Promise<SkillFacetResponse> {
    return this.http.get("/api/facets/offers/skill", {
      params: params as Record<string, unknown>,
      accept: ACCEPT_JSONLD,
    });
  }

  async facetsField(params?: FacetsParams): Promise<FieldFacetResponse> {
    return this.http.get("/api/facets/offers/field", {
      params: params as Record<string, unknown>,
      accept: ACCEPT_JSONLD,
    });
  }
}
