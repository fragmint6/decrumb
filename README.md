# Decrumb

A local React prototype for parsing recipes into a clean, focused cooking view.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL in your browser. This prototype currently uses a local mock parser so it can be tested without a Python API. Paste any URL to see the demo result, or use the two demo links to preview different recipes. URLs containing `chicken`, `sheet`, or `lemon` load the chicken sample; other URLs load the pasta sample.

### Next step

Replace the mock `parseUrl` handler in `src/main.jsx` with a request to the Python API. A browser cannot reliably fetch arbitrary recipe websites directly because of CORS and scraping restrictions, so real URL parsing should happen server-side.
