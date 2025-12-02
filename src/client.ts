export interface AzboxClientOptions {
  /**
   * API key used by the Azbox API.
   * Sent as query param ?token=...
   */
  token: string;

  /**
   * Azbox project ID.
   */
  projectId: string;

  /**
   * Language code for the translations.
   * Example: "EN", "ES", "PT".
   */
  language: string;

  /**
   * Base URL of the Azbox API.
   * Default: https://api.azbox.io/v1
   */
  baseUrl?: string;
}

/**
 * Represents the data of a keyword returned by the API.
 * The backend returns { id, data } where data contains the translation and metadata.
 */
export interface AzboxKeywordData {
  translation?: string;
  context?: string;
  reference?: string;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  // Extra fields that may exist
  [key: string]: unknown;
}

export interface AzboxKeyword {
  id: string;
  data: AzboxKeywordData;
}

export interface GetKeywordsOptions {
  /**
   * Date from which you want to get only the keywords
   * updated. Sent as afterUpdatedAtStr in ISO format.
   */
  afterUpdatedAt?: Date;
}

export class AzboxClient {
  private readonly token: string;
  private readonly projectId: string;
  private readonly language: string;
  private readonly baseUrl: string;

  constructor(options: AzboxClientOptions) {
    if (!options.token) {
      throw new Error("AzboxClient: 'token' is required");
    }
    if (!options.projectId) {
      throw new Error("AzboxClient: 'projectId' is required");
    }
    if (!options.language) {
      throw new Error("AzboxClient: 'language' is required");
    }

    this.token = options.token;
    this.projectId = options.projectId;
    this.language = options.language;
    this.baseUrl = options.baseUrl ?? "https://api.azbox.io/v1";
  }

  /**
   * Gets all keywords for an Azbox project for a specific language.
   * Internally calls: GET /projects/:pid/keywords?token=...&language=...
   */
  async getKeywords(
    options: GetKeywordsOptions = {}
  ): Promise<AzboxKeyword[]> {
    const url = new URL(
      `/projects/${encodeURIComponent(this.projectId)}/keywords`,
      this.baseUrl
    );

    url.searchParams.set("token", this.token);
    url.searchParams.set("language", this.language);

    if (options.afterUpdatedAt) {
      url.searchParams.set(
        "afterUpdatedAtStr",
        options.afterUpdatedAt.toISOString()
      );
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `AzboxClient: error al obtener keywords (${response.status}) ${text}`
      );
    }

    const data = (await response.json()) as unknown;

    if (!Array.isArray(data)) {
      throw new Error(
        "AzboxClient: respuesta inesperada, se esperaba un array de keywords"
      );
    }

    return data as AzboxKeyword[];
  }
}


