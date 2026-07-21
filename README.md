# Decrumb

A React recipe reader backed by a real, dependency-free Python parser. It downloads recipe pages server-side and extracts standard Schema.org `Recipe` JSON-LD. There is no AI parser or AI fallback. If the API is unavailable, the browser uses the equivalent JavaScript JSON-LD parser when the recipe site permits cross-origin requests.

## Run locally

Use two terminals:

```bash
npm install
npm run dev:api
```

```bash
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/api` to the Python service on `127.0.0.1:8000`.

## Parsing behavior

1. `POST /api/parse` with `{ "url": "https://…" }` invokes the Python parser.
2. The server validates public URLs, follows only validated redirects, limits downloads to 5 MB, and extracts ingredients, instructions, yield, time, image, and publisher from JSON-LD.
3. If the API request fails, the frontend tries its JavaScript JSON-LD parser directly. Most sites block browser-side cross-origin reads, which is why Python remains the primary path.
4. Parse failures are shown to the user; no sample recipe or AI-generated data is substituted.

Run checks with:

```bash
npm run test:python
npm run build
```
