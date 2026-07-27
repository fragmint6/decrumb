"""Recipe Decrumber — tiny Flask backend wrapping recipe-scrapers.

Run:  python app.py   ->  http://127.0.0.1:5000
"""

import json
import os
import re
import urllib.request
import urllib.error
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
from firebase_admin.exceptions import FirebaseError

from recipe_scrapers import scrape_html

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

_firebase_available = False
service_key = os.environ.get("SERVICE_ACCOUNT_KEY_JSON")
if service_key:
    try:
        cred = credentials.Certificate(json.loads(service_key))
        firebase_admin.initialize_app(cred)
        _firebase_available = True
    except Exception:
        pass
else:
    try:
        cred = credentials.Certificate("serviceAccountKey.json")
        firebase_admin.initialize_app(cred)
        _firebase_available = True
    except FileNotFoundError:
        pass

if _firebase_available:
    db = firestore.client()
else:
    db = None

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

SIMPLE_FIELDS = [
    "title",
    "author",
    "host",
    "total_time",
    "prep_time",
    "cook_time",
    "yields",
    "image",
    "category",
    "cuisine",
    "description",
    "ratings",
    "ratings_count",
    "language",
]


def try_get(scraper, name):
    try:
        value = getattr(scraper, name)()
    except Exception:
        return None
    if value in ("", [], {}, 0):
        return None
    return value


def fetch(url: str) -> str:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
    charset = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def _extract_group(g):
    if hasattr(g, "purpose") and hasattr(g, "instructions"):
        return g.purpose, g.instructions
    if isinstance(g, (list, tuple)) and len(g) >= 2:
        return g[0], g[1]
    return None, []


HEADING_RE = re.compile(
    r"^(To\s+(make|prepare|cook|bake|serve|store|assemble|build|create)"
    r"|For\s+(the\s+)?"
    r"|Making\s+(the\s+)?"
    r"|Preparing\s+(the\s+)?"
    r"|How to\s+)",
    re.IGNORECASE,
)


def _split_into_groups(steps):
    groups = []
    cur_heading = None
    cur_steps = []
    for s in steps:
        stripped = s.strip()
        if stripped.endswith(":") or HEADING_RE.match(stripped):
            if cur_steps or cur_heading is not None:
                groups.append({"heading": cur_heading, "steps": cur_steps})
            cur_heading = stripped.rstrip(":").strip()
            cur_steps = []
        else:
            cur_steps.append(s)
    groups.append({"heading": cur_heading, "steps": cur_steps})
    return groups


def normalise_instructions(scraper):
    groups = try_get(scraper, "instructions_list")
    try:
        grouped = scraper.instructions_grouped()
        out = []
        for g in grouped:
            purpose, steps = _extract_group(g)
            steps = [s for s in (steps or []) if s.strip()]
            if steps:
                out.append({"heading": purpose, "steps": steps})
        if out:
            return out
    except Exception:
        pass
    if groups:
        flat = [s for s in groups if s.strip()]
        if len(flat) > 1 and any(
            s.strip().endswith(":") or HEADING_RE.match(s.strip()) for s in flat
        ):
            return _split_into_groups(flat)
        return [{"heading": None, "steps": flat}]
    text = try_get(scraper, "instructions")
    if text:
        steps = [s.strip() for s in text.split("\n") if s.strip()]
        return [{"heading": None, "steps": steps}]
    return []


def normalise_ingredients(scraper):
    try:
        groups = scraper.ingredient_groups()
        out = []
        for g in groups:
            items = [i for i in (getattr(g, "ingredients", None) or []) if i.strip()]
            if items:
                out.append({"heading": getattr(g, "purpose", None), "items": items})
        if out:
            return out
    except Exception:
        pass
    flat = try_get(scraper, "ingredients") or []
    return [{"heading": None, "items": [i for i in flat if i.strip()]}] if flat else []


def _verify_token(req):
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "Missing token", 401
    token = auth_header[7:]
    try:
        decoded = fb_auth.verify_id_token(token)
        return decoded, None, None
    except Exception:
        return None, "Invalid token", 401


def _require_db():
    if db is None:
        return jsonify(error="Database not configured."), 503


@app.post("/api/save")
def api_save():
    err_resp = _require_db()
    if err_resp:
        return err_resp
    user, err, code = _verify_token(request)
    if err:
        return jsonify(error=err), code
    uid = user["uid"]
    body = request.get_json(silent=True) or {}
    recipe_id = body.get("recipeId")
    recipe_data = body.get("recipeData")
    if not recipe_id or not recipe_data:
        return jsonify(error="Missing recipe data."), 400
    doc_ref = db.collection("users").document(uid).collection("recipes").document(recipe_id)
    doc_ref.set(recipe_data, merge=True)
    return jsonify(success=True)


@app.get("/api/saved")
def api_saved():
    err_resp = _require_db()
    if err_resp:
        return err_resp
    user, err, code = _verify_token(request)
    if err:
        return jsonify(error=err), code
    uid = user["uid"]
    docs = db.collection("users").document(uid).collection("recipes").order_by("savedAt", direction=firestore.Query.DESCENDING).stream()
    recipes = []
    for doc in docs:
        data = doc.to_dict()
        if data:
            data["id"] = doc.id
            recipes.append({"id": doc.id, "data": data})
    return jsonify(recipes)


@app.delete("/api/save/<recipe_id>")
def api_delete(recipe_id):
    err_resp = _require_db()
    if err_resp:
        return err_resp
    user, err, code = _verify_token(request)
    if err:
        return jsonify(error=err), code
    uid = user["uid"]
    db.collection("users").document(uid).collection("recipes").document(recipe_id).delete()
    return jsonify(success=True)


@app.post("/api/scrape")
def api_scrape():
    payload = request.get_json(silent=True) or {}
    url = (payload.get("url") or "").strip()
    if not url:
        return jsonify(error="Please paste a recipe URL."), 400
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        html = fetch(url)
    except urllib.error.HTTPError as e:
        return jsonify(error=f"The site refused the request (HTTP {e.code})."), 502
    except Exception as e:
        return jsonify(error=f"Couldn't reach that page: {e}"), 502
    try:
        scraper = scrape_html(html, org_url=url, wild_mode=True)
    except Exception as e:
        return jsonify(error=f"No recipe found on that page ({e})."), 422
    data = {f: try_get(scraper, f) for f in SIMPLE_FIELDS}
    data["url"] = try_get(scraper, "canonical_url") or url
    data["ingredient_groups"] = normalise_ingredients(scraper)
    data["instruction_groups"] = normalise_instructions(scraper)
    data["nutrients"] = try_get(scraper, "nutrients")
    if not data["ingredient_groups"] and not data["instruction_groups"]:
        return jsonify(error="That page doesn't seem to contain a readable recipe."), 422
    return jsonify(data)


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
