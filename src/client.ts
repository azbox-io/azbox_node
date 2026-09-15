/** Prefix of AZbox API keys created in the dashboard. */
export const API_KEY_PREFIX = "azb_live_";

export const DEFAULT_BASE_URL = "https://api.azbox.io";

export interface AzboxClientOptions {
  /**
   * API key from the AZbox dashboard (Settings → API keys), `azb_live_…`.
   * Keys with that prefix travel in the `x-api-key` header; older credentials
   * are sent as `?api_key=`, which is where the API expects them.
   */
  apiKey?: string;

  /**
   * Same as `apiKey`. Kept because 0.1.x only accepted this name.
   * @deprecated Use `apiKey`.
   */
  token?: string;

  /** AZbox project ID. */
  projectId: string;

  /**
   * Language code as configured in the project, for example "EN", "ES",
   * "PT-BR". It is sent in upper case: the API compares codes exactly, and a
   * lower-case one returns every keyword without any translation.
   */
  language: string;

  /**
   * Base URL of the API. Default: https://api.azbox.io
   * A trailing `/v1` is accepted, so the 0.1.x default still works.
   */
  baseUrl?: string;

  /** Custom fetch implementation. Default: the global `fetch` (Node 18+). */
  fetch?: typeof fetch;
}

/**
 * A keyword as returned by the API. The key your code looks up is
 * `data.keyword`; `id` is an internal document identifier.
 */
export interface AzboxKeywordData {
  keyword?: string;
  /** Absent when the keyword has no text yet in the requested language. */
  translation?: string;
  context?: string;
  reference?: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface AzboxKeyword {
  id: string;
  data: AzboxKeywordData;
}

export interface GetKeywordsOptions {
  /** Only keywords updated after this date. Sent as `afterUpdatedAtStr`. */
  afterUpdatedAt?: Date;
}

export class AzboxError extends Error {
  /** HTTP status, when the API answered. */
  readonly status?: number;
  /** The API's own message, when it sent one. */
  readonly detail?: string;

  constructor(message: string, options: { status?: number; detail?: string } = {}) {
    super(message);
    this.name = "AzboxError";
    this.status = options.status;
    this.detail = options.detail;
  }
}

export function isApiKey(credential: unknown): boolean {
  return (
    typeof credential === "string" &&
    credential.startsWith(API_KEY_PREFIX) &&
    credential.length >= API_KEY_PREFIX.length + 20
  );
}

export class AzboxClient {
  private readonly apiKey: string;
  private readonly projectId: string;
  private readonly language: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AzboxClientOptions) {
    const apiKey = options?.apiKey ?? options?.token;
    if (!apiKey) {
      throw new AzboxError("AzboxClient: 'apiKey' is required");
    }
    if (!options.projectId) {
      throw new AzboxError("AzboxClient: 'projectId' is required");
    }
    if (!options.language) {
      throw new AzboxError("AzboxClient: 'language' is required");
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new AzboxError(
        "AzboxClient: global fetch is not available. Use Node 18 or newer, or pass 'fetch'."
      );
    }

    this.apiKey = apiKey;
    this.projectId = options.projectId;
    this.language = String(options.language).toUpperCase();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
    this.fetchImpl = fetchImpl;
  }

  /**
   * All keywords of the project in the client's language.
   *
   * Returns `[]` when the project has no keywords: the API answers 404 in that
   * case, which means "nothing yet", not a failure. An unknown language does
   * throw.
   */
  async getKeywords(options: GetKeywordsOptions = {}): Promise<AzboxKeyword[]> {
    // Built as one string, not new URL("/projects/…", base): a leading slash
    // drops the path of the base URL, and that is what broke 0.1.x.
    const url = new URL(
      `${this.baseUrl}/v1/projects/${encodeURIComponent(this.projectId)}/keywords`
    );
    const headers: Record<string, string> = { accept: "application/json" };
    if (isApiKey(this.apiKey)) {
      headers["x-api-key"] = this.apiKey;
    } else {
      url.searchParams.set("api_key", this.apiKey);
    }
    url.searchParams.set("language", this.language);
    if (options.afterUpdatedAt) {
      url.searchParams.set("afterUpdatedAtStr", options.afterUpdatedAt.toISOString());
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new AzboxError(`AzboxClient: could not reach ${this.baseUrl}: ${reason}`);
    }

    if (response.status === 404) {
      const detail = await readDetail(response);
      if (/language/i.test(detail ?? "")) {
        throw new AzboxError(
          `AzboxClient: language "${this.language}" does not exist in project ${this.projectId}`,
          { status: 404, detail }
        );
      }
      return [];
    }

    if (response.status === 401) {
      throw new AzboxError(
        `AzboxClient: the API rejected the API key. Create one in the AZbox dashboard (it starts with ${API_KEY_PREFIX}).`,
        { status: 401, detail: await readDetail(response) }
      );
    }

    if (response.status === 403) {
      throw new AzboxError(
        `AzboxClient: the API key has no access to project ${this.projectId}, or is bound to another project.`,
        { status: 403, detail: await readDetail(response) }
      );
    }

    if (!response.ok) {
      throw new AzboxError(`AzboxClient: the API answered ${response.status}`, {
        status: response.status,
        detail: await readDetail(response),
      });
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new AzboxError("AzboxClient: unexpected response, expected an array of keywords");
    }
    return body as AzboxKeyword[];
  }

  /**
   * The same data as a plain `{ keyword: translation }` object, ready for a
   * lookup. Keywords without a translation in this language are left out.
   */
  async getTranslations(options: GetKeywordsOptions = {}): Promise<Record<string, string>> {
    const translations: Record<string, string> = {};
    for (const item of await this.getKeywords(options)) {
      const key = item?.data?.keyword;
      const value = item?.data?.translation;
      if (typeof key === "string" && key !== "" && typeof value === "string") {
        translations[key] = value;
      }
    }
    return translations;
  }
}

async function readDetail(response: Response): Promise<string | undefined> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }
  try {
    const body = JSON.parse(text);
    return typeof body?.detail === "string" ? body.detail : text;
  } catch {
    return text || undefined;
  }
}
