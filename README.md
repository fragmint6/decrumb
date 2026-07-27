# ✂ Decrumb

Paste a recipe URL, get just the recipe — no life story, no ads, no pop-ups.

Plain HTML + CSS + vanilla JS front end, with a ~130-line Flask backend that
wraps [`recipe-scrapers`](https://github.com/hhursev/recipe-scrapers).

## Run

```bash
pip install -r requirements.txt
python app.py
# open http://127.0.0.1:5000
```

## Files

| File | What it is |
|---|---|
| `app.py` | Flask app: fetches the page, runs `recipe-scrapers`, returns clean JSON |
| `static/index.html` | Markup (no build step, no CDN, no framework) |
| `static/style.css` | Styling, responsive layout, print stylesheet |
| `static/app.js` | Fetch, render, checkboxes, scaling, copy, print |

## Features

- **Any supported site** — hundreds of hosts have dedicated parsers; anything
  else falls back to `wild_mode=True` (schema.org / JSON-LD parsing).
- **Ingredient & step groups** preserved (e.g. "For the sauce", "Garnish").
- **Serving scaler** — cycles 1× → ½× → 2× → 3×, rewriting quantities in the
  ingredient list, including unicode fractions (`1½ cups` → `¾ cups`).
- **Tap to check off** any ingredient or step while cooking.
- **Copy as plain text** (respects the current scale) and **Print** via a
  dedicated print stylesheet.
- **Deep links** — `?url=https://…` loads and scrapes automatically, so you can
  make it a browser bookmarklet/search keyword.
- Nutrition table when the site publishes it.

## API

```
POST /api/scrape   {"url": "https://…"}
```

Returns `title, author, host, description, image, prep_time, cook_time,
total_time, yields, category, cuisine, ratings, ingredient_groups,
instruction_groups, nutrients, url` — every field individually guarded, so a
scraper that doesn't implement something just yields `null` instead of a 500.

## Notes

Some large publishers (AllRecipes, NYT Cooking, Serious Eats) sit behind bot
protection and return `403`/`404` to a plain server-side request; the UI shows a
friendly error for those. Tested working on BBC Good Food, RecipeTin Eats,
Budget Bytes and similar.

## Bookmarklet

```js
javascript:location.href='http://127.0.0.1:5000/?url='+encodeURIComponent(location.href)
```
