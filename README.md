## azbox-node

Very small Node.js / TypeScript client to fetch **keywords** for an **Azbox** project.

### Installation

```bash
npm install azbox-node
```

> Use Node 18 or newer (relies on native `fetch`).

### Basic usage

```ts
import { AzboxClient } from "azbox-node";

const client = new AzboxClient({
  apiKey: process.env.AZBOX_API_KEY!, // Azbox API key
  projectId: "my-project-id",         // Azbox project ID
  language: "EN"                      // e.g. EN, ES, PT
});

async function main() {
  const keywords = await client.getKeywords();

  // keywords is an array of { id, data }
  for (const kw of keywords) {
    console.log(kw.id, kw.data.translation);
  }
}

main().catch(console.error);
```

### Sync only recent changes

The Azbox backend exposes on `/v1/projects/:pid/keywords` the parameter
`afterUpdatedAtStr`, which lets you fetch only the keywords updated after
a specific date.

```ts
import { AzboxClient } from "azbox-node";

const client = new AzboxClient({
  apiKey: process.env.AZBOX_API_KEY!,
  projectId: "my-project-id",
  language: "ES"
});

// Example: only fetch changes since the last sync
const lastSync = new Date("2025-01-01T00:00:00.000Z");

const updatedKeywords = await client.getKeywords({
  afterUpdatedAt: lastSync
});
```

### Client API

- **`new AzboxClient(options)`**
  - **`apiKey`**: `string` (required) – sent as `?token=...` on the query string.
  - **`projectId`**: `string` (required) – Azbox project ID.
  - **`language`**: `string` (required) – language code (for example `EN`, `ES`).
  - **`baseUrl`**: `string` (optional) – defaults to `https://api.azbox.io/v1`.

- **`client.getKeywords(options?)`** → `Promise<AzboxKeyword[]>`
  - **`afterUpdatedAt`**: `Date` (optional) – if provided, sent as `afterUpdatedAtStr` in ISO format.
  - Returns the array coming from the backend API:
    - `{ id: string, data: { translation?: string, context?: string, ... } }`

This library does not implement any cache or persistence; it only wraps the HTTP call in a small, typed client.

### Caching recommendation

Azbox has a **monthly request limit**, so it is strongly recommended that you:

- Cache the keywords in memory in your app, **or**
- Persist them in your own database and periodically sync using `afterUpdatedAt`

This way you avoid hitting the Azbox API on every request of your application and you stay within your quota. 


