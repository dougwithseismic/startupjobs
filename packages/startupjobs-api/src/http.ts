export interface HttpClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  cookies?: string;
}

export class HttpClient {
  constructor(private config: HttpClientConfig) {}

  private buildHeaders(
    accept: string,
    extra?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: accept,
      ...this.config.headers,
      ...extra,
    };
    if (this.config.cookies) {
      headers["Cookie"] = this.config.cookies;
    }
    return headers;
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(path, this.config.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            url.searchParams.append(`${key}[]`, String(v));
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async get<T>(
    path: string,
    options?: {
      params?: Record<string, unknown>;
      accept?: string;
    },
  ): Promise<T> {
    const accept = options?.accept ?? "application/json";
    const url = this.buildUrl(path, options?.params);
    const res = await fetch(url, {
      method: "GET",
      headers: this.buildHeaders(accept),
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: { params?: Record<string, unknown> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const res = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders("application/json", {
        "Content-Type": "application/json",
      }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json() as Promise<T>;
  }

  async put<T>(
    path: string,
    body?: unknown,
    options?: { params?: Record<string, unknown> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const res = await fetch(url, {
      method: "PUT",
      headers: this.buildHeaders("application/json", {
        "Content-Type": "application/json",
      }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(
    path: string,
    body?: unknown,
    options?: { params?: Record<string, unknown> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const res = await fetch(url, {
      method: "PATCH",
      headers: this.buildHeaders("application/json", {
        "Content-Type": "application/json",
      }),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json() as Promise<T>;
  }

  async delete<T>(
    path: string,
    options?: { params?: Record<string, unknown> },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.buildHeaders("application/json"),
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json() as Promise<T>;
  }

  async uploadFile(
    path: string,
    file: Blob,
    filename: string,
  ): Promise<unknown> {
    const url = this.buildUrl(path);
    const form = new FormData();
    form.append("file", file, filename);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.config.headers,
    };
    if (this.config.cookies) {
      headers["Cookie"] = this.config.cookies;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      throw new ApiError(res.status, res.statusText, url);
    }
    return res.json();
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public url: string,
  ) {
    super(`${status} ${statusText}: ${url}`);
    this.name = "ApiError";
  }
}
