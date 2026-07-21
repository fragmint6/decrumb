#!/usr/bin/env python3
"""Small recipe extraction API for Decrumb (no AI involved)."""
from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_PAGE_BYTES = 5 * 1024 * 1024
USER_AGENT = "Decrumb/0.1 (+recipe reader)"


class ParseError(Exception):
    pass


def validate_url(value: str) -> str:
    try:
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username:
            raise ValueError
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
        if not addresses:
            raise ValueError
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global:
                raise ValueError
    except (ValueError, socket.gaierror) as exc:
        raise ParseError("Please enter a public http or https URL.") from exc
    return value


class SafeRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, validate_url(newurl))


def fetch_page(url: str) -> tuple[str, str]:
    validate_url(url)
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
    try:
        with build_opener(SafeRedirects()).open(request, timeout=12) as response:
            content_type = response.headers.get_content_type()
            if content_type not in ("text/html", "application/xhtml+xml"):
                raise ParseError("That URL did not return an HTML page.")
            body = response.read(MAX_PAGE_BYTES + 1)
            if len(body) > MAX_PAGE_BYTES:
                raise ParseError("That page is too large to parse.")
            charset = response.headers.get_content_charset() or "utf-8"
            return body.decode(charset, errors="replace"), response.geturl()
    except ParseError:
        raise
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ParseError("The recipe page could not be downloaded.") from exc


def walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_json(child)


def is_recipe(node: dict) -> bool:
    kind = node.get("@type", "")
    return "Recipe" in kind if isinstance(kind, list) else kind == "Recipe"


def plain_text(value) -> str:
    if isinstance(value, dict):
        value = value.get("text") or value.get("name") or ""
    value = re.sub(r"<[^>]+>", " ", str(value or ""))
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def instructions(value) -> list[str]:
    result = []
    if isinstance(value, str):
        result.extend(re.split(r"(?:\r?\n)+", value))
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and isinstance(item.get("itemListElement"), list):
                result.extend(instructions(item["itemListElement"]))
            else:
                result.append(plain_text(item))
    elif value:
        result.append(plain_text(value))
    return [step for step in map(plain_text, result) if step]


def image_url(value, base: str) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl") or ""
    return urljoin(base, str(value)) if value else ""


def duration(value) -> str:
    if not value:
        return "Time not listed"
    match = re.fullmatch(r"P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?", str(value), re.I)
    if not match:
        return plain_text(value)
    hours, minutes = (int(part or 0) for part in match.groups())
    return " ".join(filter(None, (f"{hours} hr" if hours else "", f"{minutes} min" if minutes else ""))) or "0 min"


def servings(value) -> int:
    match = re.search(r"\d+", plain_text(value))
    return max(1, int(match.group())) if match else 4


def split_ingredient(line: str) -> list[str]:
    # Keep display parsing deliberately conservative; the original text remains intact.
    match = re.match(r"^\s*((?:\d+[\s-]+)?(?:\d+\s*/\s*\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*(?:\d+(?:\.\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞]))?\s*(?:cups?|tbsp|tsp|oz|ounces?|lbs?|pounds?|g|kg|ml|l|cloves?|cans?)?\b)?\s*(.*)$", plain_text(line), re.I)
    if match and match.group(1).strip() and match.group(2).strip():
        return [match.group(1).strip(), match.group(2).strip()]
    return ["", plain_text(line)]


def parse_recipe(document: str, page_url: str) -> dict:
    scripts = re.findall(r"<script\b[^>]*type\s*=\s*['\"]application/ld\+json['\"][^>]*>(.*?)</script\s*>", document, re.I | re.S)
    candidates = []
    for script in scripts:
        try:
            decoded = json.loads(html.unescape(script).strip())
            candidates.extend(node for node in walk_json(decoded) if is_recipe(node))
        except (json.JSONDecodeError, TypeError):
            continue
    if not candidates:
        raise ParseError("No structured recipe was found on that page.")
    node = max(candidates, key=lambda item: len(item.get("recipeIngredient", [])) + len(instructions(item.get("recipeInstructions"))))
    ingredients = [split_ingredient(item) for item in node.get("recipeIngredient", []) if plain_text(item)]
    steps = instructions(node.get("recipeInstructions"))
    title = plain_text(node.get("name"))
    if not title or not ingredients or not steps:
        raise ParseError("The page's recipe data is incomplete.")
    parsed = urlparse(page_url)
    source = parsed.hostname.removeprefix("www.") if parsed.hostname else "Recipe site"
    publisher = node.get("publisher", {})
    source_label = plain_text(publisher) if publisher else source
    return {"title": title, "source": source, "sourceLabel": source_label or source,
            "time": duration(node.get("totalTime") or node.get("cookTime") or node.get("prepTime")),
            "servings": servings(node.get("recipeYield")), "image": image_url(node.get("image"), page_url),
            "ingredients": ingredients, "steps": steps, "url": page_url}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/parse":
            return self.send_json(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                raise ParseError("Request is too large.")
            payload = json.loads(self.rfile.read(length) or b"{}")
            document, final_url = fetch_page(str(payload.get("url", "")))
            self.send_json(200, parse_recipe(document, final_url))
        except (ParseError, json.JSONDecodeError) as exc:
            self.send_json(422, {"error": str(exc) or "Invalid request."})
        except Exception:
            self.send_json(500, {"error": "The recipe could not be parsed."})

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers(); self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[api] {fmt % args}")


if __name__ == "__main__":
    print("Decrumb API listening at http://127.0.0.1:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
