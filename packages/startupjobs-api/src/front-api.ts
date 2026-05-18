import { HttpClient } from "./http.js";
import type {
  ApplicationPayload,
  ApplicationResponse,
  CompanyListResponse,
  HomepageCompany,
  IntercomConfig,
  JobAlert,
  JobAlertsResponse,
  LanguageTag,
  Login2faPayload,
  LoginPayload,
  NewsletterSettings,
  OfferDetail,
  OfferListResponse,
  OfferRecommendationsResponse,
  PasswordChangePayload,
  PasswordResetPayload,
  RegisterPayload,
  UserProfile,
  UserSettings,
} from "./types/index.js";

export class FrontApi {
  constructor(private http: HttpClient) {}

  // ━━ Verified endpoints (confirmed 200 on .cz) ━━━━━━━━

  // ── User ──────────────────────────────────────────────

  async getUser(): Promise<unknown> {
    return this.http.get("/api/front/user");
  }

  async getUserProfile(): Promise<UserProfile> {
    return this.http.get("/api/front/user/profile");
  }

  async getUserSettings(): Promise<UserSettings> {
    return this.http.get("/api/front/user/settings");
  }

  async getNewsletterSettings(): Promise<NewsletterSettings> {
    return this.http.get("/api/user/newsletter-settings");
  }

  async updateNewsletterSettings(
    settings: Partial<NewsletterSettings>,
  ): Promise<unknown> {
    return this.http.put("/api/user/newsletter-settings", settings);
  }

  // ── Offers ────────────────────────────────────────────

  async listOffers(params?: Record<string, unknown>): Promise<OfferListResponse> {
    return this.http.get("/api/offers", { params });
  }

  async getOfferDetail(
    offerId: number,
    locale: string = "cs",
  ): Promise<OfferDetail> {
    return this.http.get(`/api/front/offer/${offerId}`, {
      params: { locale },
    });
  }

  async trackOfferView(offerId: number): Promise<void> {
    await this.http.post(`/api/front/offer-look/${offerId}`);
  }

  async getOffersForMe(): Promise<number[]> {
    return this.http.get("/api/offers/forMe");
  }

  async getBookmarkedOffers(): Promise<number[]> {
    return this.http.get("/api/offers/bookmarked");
  }

  async getSeenOffers(): Promise<number[]> {
    return this.http.get("/api/offers/seen");
  }

  async getAppliedToOffers(): Promise<number[]> {
    return this.http.get("/api/offers/applied-to");
  }

  async getLikedOffers(): Promise<unknown[]> {
    return this.http.get("/api/offers/liked");
  }

  async getOfferRecommendations(
    offerId: number,
  ): Promise<OfferRecommendationsResponse> {
    return this.http.get("/api/offers/recommendation", {
      params: { offer: offerId },
    });
  }

  // ── Applications ──────────────────────────────────────

  async createUnfinishedApplication(
    offerId: number,
    recommId?: string | null,
  ): Promise<unknown> {
    return this.http.post(`/api/offer/${offerId}/unfinished-applications`, {
      recommId: recommId ?? null,
    });
  }

  async deleteUnfinishedApplication(offerId: number): Promise<unknown> {
    return this.http.delete(`/api/offer/${offerId}/unfinished-applications`);
  }

  async submitApplication(
    offerId: number,
    payload: ApplicationPayload,
  ): Promise<ApplicationResponse> {
    return this.http.post(`/offer/${offerId}/application/create`, { payload });
  }

  // ── Companies ─────────────────────────────────────────

  async listCompanies(
    params?: Record<string, unknown>,
  ): Promise<CompanyListResponse> {
    return this.http.get("/api/companies", { params });
  }

  async getHomepageCompanies(): Promise<HomepageCompany[]> {
    return this.http.get("/api/homepage-data/companies");
  }

  // ── Job Alerts ────────────────────────────────────────

  async getJobAlerts(): Promise<JobAlertsResponse> {
    return this.http.get("/api/job-alerts");
  }

  async createJobAlert(params: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/api/job-alerts", params);
  }

  async updateJobAlert(
    id: number,
    data: Partial<JobAlert>,
  ): Promise<unknown> {
    return this.http.patch(`/api/job-alerts/${id}`, data);
  }

  async deleteJobAlert(id: number): Promise<unknown> {
    return this.http.delete(`/api/job-alerts/${id}`);
  }

  // ── Reference Data ────────────────────────────────────

  async getLanguages(): Promise<LanguageTag[]> {
    return this.http.get("/api/languages");
  }

  // ── Intercom ──────────────────────────────────────────

  async getIntercomConfig(): Promise<IntercomConfig> {
    return this.http.get("/api/intercom");
  }

  // ━━ Unverified endpoints (found in Nuxt chunks, 404 on .cz currently) ━━

  // ── Auth ──────────────────────────────────────────────

  async login(payload: LoginPayload): Promise<unknown> {
    return this.http.post("/api/login", payload);
  }

  async login2fa(payload: Login2faPayload): Promise<unknown> {
    return this.http.post("/api/login/2fa", payload);
  }

  async getLoginStatus(): Promise<unknown> {
    return this.http.get("/api/login/status");
  }

  async logout(): Promise<unknown> {
    return this.http.post("/api/logout");
  }

  async register(payload: RegisterPayload): Promise<unknown> {
    return this.http.post("/api/user/register", payload);
  }

  async activateUser(token: string): Promise<unknown> {
    return this.http.post("/api/user/activate", { token });
  }

  async requestPasswordReset(
    payload: PasswordResetPayload,
  ): Promise<unknown> {
    return this.http.post("/api/user/password-reset", payload);
  }

  async resetPassword(token: string, password: string): Promise<unknown> {
    return this.http.post(`/api/user/password/reset/${token}`, { password });
  }

  async changePassword(payload: PasswordChangePayload): Promise<unknown> {
    return this.http.post("/api/user/password", payload);
  }

  async oauthConnect(provider: string, token: string): Promise<unknown> {
    return this.http.post("/api/oauth-login/connect", { provider, token });
  }

  // ── 2FA ───────────────────────────────────────────────

  async get2faStatus(): Promise<unknown> {
    return this.http.get("/api/user/2fa");
  }

  async generate2faActivationCode(): Promise<unknown> {
    return this.http.post("/api/user/2fa/activation-code");
  }

  async disable2fa(): Promise<unknown> {
    return this.http.post("/api/user/2fa/disable");
  }

  // ── User (unverified) ────────────────────────────────

  async getMe(): Promise<unknown> {
    return this.http.get("/api/user/me");
  }

  async deleteUser(): Promise<unknown> {
    return this.http.delete("/api/user/delete");
  }

  async switchLocale(locale: string): Promise<unknown> {
    return this.http.post("/api/user/switch-locale", { locale });
  }

  async requestVerification(): Promise<unknown> {
    return this.http.post("/api/user/verification-request");
  }

  async generateVerification(): Promise<unknown> {
    return this.http.post("/api/user/verification/generate");
  }

  // ── Profile Management (unverified) ──────────────────

  async getProfile(): Promise<unknown> {
    return this.http.get("/api/user/profile");
  }

  async updateBio(bio: Record<string, string>): Promise<unknown> {
    return this.http.put("/api/profile/bio", bio);
  }

  async updatePreferences(prefs: Record<string, unknown>): Promise<unknown> {
    return this.http.put("/api/profile/preferences", prefs);
  }

  async addArea(areaId: number): Promise<unknown> {
    return this.http.post("/api/profile/add-area", { areaId });
  }

  async addLocation(location: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/api/profile/add-location", location);
  }

  async addSeniority(seniorityId: number): Promise<unknown> {
    return this.http.post("/api/profile/add-seniority", { seniorityId });
  }

  async addSkill(skillId: number): Promise<unknown> {
    return this.http.post("/api/profile/add-skill", { skillId });
  }

  async uploadAvatar(file: Blob): Promise<unknown> {
    return this.http.uploadFile("/api/user/profile/avatar", file, "avatar");
  }

  async uploadCv(file: Blob, filename: string): Promise<unknown> {
    return this.http.uploadFile("/api/user/profile/cv", file, filename);
  }

  async uploadAttachment(file: Blob, filename: string): Promise<unknown> {
    return this.http.uploadFile(
      "/api/user/profile/attachment",
      file,
      filename,
    );
  }

  // ── Educations (unverified) ──────────────────────────

  async getEducations(): Promise<unknown[]> {
    return this.http.get("/api/user/profile/educations");
  }

  async createEducation(data: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/api/user/profile/educations", data);
  }

  async updateEducation(
    id: number,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.put(`/api/user/profile/educations/${id}`, data);
  }

  async deleteEducation(id: number): Promise<unknown> {
    return this.http.delete(`/api/user/profile/educations/${id}`);
  }

  // ── Employments (unverified) ─────────────────────────

  async getEmployments(): Promise<unknown[]> {
    return this.http.get("/api/user/profile/employments");
  }

  async createEmployment(data: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/api/user/profile/employments", data);
  }

  async updateEmployment(
    id: number,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.put(`/api/user/profile/employments/${id}`, data);
  }

  async deleteEmployment(id: number): Promise<unknown> {
    return this.http.delete(`/api/user/profile/employments/${id}`);
  }

  // ── Email (unverified) ───────────────────────────────

  async requestEmailChange(email: string): Promise<unknown> {
    return this.http.post("/api/user/email-change-requests", { email });
  }

  async confirmEmailChange(token: string): Promise<unknown> {
    return this.http.post(
      `/api/user/email-change-requests/${token}/confirm`,
    );
  }

  async getEmailSettings(): Promise<unknown> {
    return this.http.get("/api/user/email-settings");
  }

  async updateEmailSettings(
    settings: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.put("/api/user/email-settings", settings);
  }

  async getAnonymousEmailSettings(emailToken: string): Promise<unknown> {
    return this.http.get(`/api/anonymous/${emailToken}/email-settings`);
  }

  // ── Likes (unverified) ───────────────────────────────

  async likeOffer(offerId: number): Promise<unknown> {
    return this.http.post(`/api/offers/${offerId}/like`);
  }

  // ── Me (unverified) ──────────────────────────────────

  async getAppliedOfferIds(): Promise<number[]> {
    return this.http.get("/api/me/applied-offer-ids");
  }

  async getLikedOfferIds(): Promise<number[]> {
    return this.http.get("/api/me/liked-offer-ids");
  }

  async getSeenOfferIds(): Promise<number[]> {
    return this.http.get("/api/me/seen-offer-ids");
  }

  // ── Followed Searches (unverified) ───────────────────

  async getFollowedSearches(): Promise<unknown[]> {
    return this.http.get("/api/me/followed-searches");
  }

  async createFollowedSearch(
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.post("/api/me/followed-searches", params);
  }

  async deleteFollowedSearch(id: string): Promise<unknown> {
    return this.http.delete(`/api/me/followed-searches/${id}`);
  }

  // ── Followed Companies (unverified) ──────────────────

  async getFollowedCompanies(): Promise<unknown[]> {
    return this.http.get("/api/followed-companies");
  }

  async getFollowedCompanySlugs(): Promise<string[]> {
    return this.http.get("/api/followed-companies-slugs");
  }

  async followCompany(companySlug: string): Promise<unknown> {
    return this.http.post(`/api/followed-companies/${companySlug}`);
  }

  async unfollowCompany(companySlug: string): Promise<unknown> {
    return this.http.delete(`/api/followed-companies/${companySlug}`);
  }

  async applyAsAspirant(
    companySlug: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.post(`/api/companies/${companySlug}/aspirants`, data);
  }

  async applyAsAspirantGuest(
    companySlug: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.post(
      `/api/companies/${companySlug}/aspirants/guest`,
      data,
    );
  }

  // ── Search (unverified) ──────────────────────────────

  async searchOffers(params?: Record<string, unknown>): Promise<unknown> {
    return this.http.get("/api/search-offers", { params });
  }

  async searchOffersFacets(
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.get("/api/search-offers/facets", { params });
  }

  async searchOffersPersonalized(
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.get("/api/search-offers/personalized", { params });
  }

  async searchOffersLiked(
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.http.get("/api/search-offers/liked", { params });
  }

  async autocompleteCompanies(query: string): Promise<unknown[]> {
    return this.http.get("/api/search-offers/companies-autocomplete", {
      params: { query },
    });
  }

  async autocompleteLocations(query: string): Promise<unknown[]> {
    return this.http.get("/api/search-offers/locations-autocomplete", {
      params: { query },
    });
  }

  async autocompleteSkills(query: string): Promise<unknown[]> {
    return this.http.get("/api/search-offers/skills-autocomplete", {
      params: { query },
    });
  }

  // ── Notifications / Matches (unverified) ─────────────

  async getNotifications(): Promise<unknown[]> {
    return this.http.get("/api/user/notifications");
  }

  async markNotificationsRead(): Promise<unknown> {
    return this.http.post("/api/user/notifications/read");
  }

  async getUnreadNotificationCount(): Promise<unknown> {
    return this.http.get("/api/user/notifications/unread-count");
  }

  async getMatches(): Promise<unknown[]> {
    return this.http.get("/api/user/matches");
  }

  async getMatch(id: string): Promise<unknown> {
    return this.http.get(`/api/user/matches/${id}`);
  }

  async getUnreadMatchMessageCount(): Promise<unknown> {
    return this.http.get("/api/user/matches/messages/unread-count");
  }

  // ── Candidates (unverified) ──────────────────────────

  async getOfferCandidates(offerId: number): Promise<unknown[]> {
    return this.http.get(`/api/offers/${offerId}/candidates`);
  }

  async getOfferCandidatesGuest(offerId: number): Promise<unknown[]> {
    return this.http.get(`/api/offers/${offerId}/candidates/guest`);
  }

  // ── Reference Data (unverified) ──────────────────────

  async getDisciplines(): Promise<unknown[]> {
    return this.http.get("/api/disciplines");
  }

  async getFields(): Promise<unknown[]> {
    return this.http.get("/api/fields");
  }

  async getPositions(): Promise<unknown[]> {
    return this.http.get("/api/positions");
  }

  async getSchools(): Promise<unknown[]> {
    return this.http.get("/api/schools");
  }

  async getSkills(): Promise<unknown[]> {
    return this.http.get("/api/skills");
  }

  async getWorkplaces(): Promise<unknown[]> {
    return this.http.get("/api/workplaces");
  }

  async getLocationHints(query: string): Promise<unknown[]> {
    return this.http.get("/api/location-hints", { params: { query } });
  }

  async getTranslation(locale: string): Promise<unknown> {
    return this.http.get("/api/translation", { params: { locale } });
  }

  // ── GDPR (unverified) ────────────────────────────────

  async submitGdprRequest(data: Record<string, unknown>): Promise<unknown> {
    return this.http.post("/api/gdpr", data);
  }

  // ── Company Detail ────────────────────────────────────

  async getCompany(slug: string): Promise<unknown> {
    return this.http.get(`/api/companies/${slug}`);
  }
}
