import { AdminApi } from "./admin-api.js";
import { CoreApi } from "./core-api.js";
import { FrontApi } from "./front-api.js";
import { HttpClient } from "./http.js";

export interface StartupJobsClientConfig {
  cookies?: string;
  locale?: "cs" | "en";
  headers?: Record<string, string>;
  coreBaseUrl?: string;
  frontBaseUrl?: string;
}

const CORE_BASE_URL = "https://core.startupjobs.cz";
const FRONT_BASE_URL = "https://www.startupjobs.cz";

export class StartupJobsClient {
  public readonly core: CoreApi;
  public readonly front: FrontApi;
  public readonly admin: AdminApi;

  constructor(config: StartupJobsClientConfig = {}) {
    const coreHttp = new HttpClient({
      baseUrl: config.coreBaseUrl ?? CORE_BASE_URL,
      headers: {
        Origin: config.frontBaseUrl ?? FRONT_BASE_URL,
        Referer: `${config.frontBaseUrl ?? FRONT_BASE_URL}/`,
        ...config.headers,
      },
      cookies: config.cookies,
    });

    const frontHttp = new HttpClient({
      baseUrl: config.frontBaseUrl ?? FRONT_BASE_URL,
      headers: config.headers,
      cookies: config.cookies,
    });

    this.core = new CoreApi(coreHttp);
    this.front = new FrontApi(frontHttp);
    this.admin = new AdminApi(frontHttp);
  }
}
