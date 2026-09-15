# azbox-node

Small Node.js / TypeScript client to fetch the translations of an [AZbox](https://azbox.io) project.

> **Upgrade from 0.1.x.** Versions 0.1.0 and 0.1.1 never worked: they called a URL without `/v1`, sent a parameter the API rejects, and `require("azbox-node")` pointed to a file that was not in the package. 0.2.0 fixes all three and keeps the same class and method, so existing code only needs the upgrade.

## Install

```bash
npm install azbox-node
```

Node 18 or newer (it uses the global `fetch`). Works with `import` and `require`.

## Usage

```ts
import { AzboxClient } from "azbox-node";

const client = new AzboxClient({
  apiKey: process.env.AZBOX_API_KEY!, // dashboard → Settings → API keys (azb_live_…)
  projectId: process.env.AZBOX_PROJECT_ID!,
  language: "ES", // as configured in the project
});

const t = await client.getTranslations();
// { "home.title": "Bienvenido", … }
```

`getTranslations()` gives you a `{ keyword: translation }` object and leaves out keywords that have no text yet in that language. If you need the raw data, `getKeywords()` returns what the API sends:

```ts
const keywords = await client.getKeywords();
// [{ id: "8Kd0pQ2m…", data: { keyword: "home.title", translation: "Bienvenido", … } }]
```

The key is `data.keyword`. `id` is an internal document identifier.

## Sync only what changed

```ts
const changed = await client.getTranslations({ afterUpdatedAt: lastSync });
```

Store the time of the response you last applied, not the current clock, or you will miss anything written while your request was in flight.

Fetch once and keep the result in memory or on disk: calling the API on every request of your app adds a network round trip to each one.

## API

### `new AzboxClient(options)`

| Option | Required | |
|---|---|---|
| `apiKey` | yes | API key. `azb_live_…` keys go in the `x-api-key` header; older credentials as `?api_key=`. `token` is accepted as an alias. |
| `projectId` | yes | Project ID from the dashboard. |
| `language` | yes | Language code of the project (`EN`, `ES`, `PT-BR`…). Sent in upper case. |
| `baseUrl` | no | Default `https://api.azbox.io`. |
| `fetch` | no | Custom `fetch` implementation. |

One client reads one language. For several, create one per language.

### `client.getKeywords({ afterUpdatedAt? })` → `Promise<AzboxKeyword[]>`

Returns `[]` when the project has no keywords (the API answers 404 for that).

### `client.getTranslations({ afterUpdatedAt? })` → `Promise<Record<string, string>>`

### Errors

Failures throw `AzboxError` with `status` and the API's `detail` when there is one:

- **401**: the API key is wrong or revoked.
- **403**: the key has no access to that project, or is bound to another one.
- **404** with `status` set: the language does not exist in the project.

A language code the project does not have, but which the API accepts, returns every keyword with no translation. If `getTranslations()` comes back empty, check the code.

## Tests

```bash
npm test
```

## License

MIT
