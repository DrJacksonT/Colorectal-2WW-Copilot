#!/usr/bin/env python3
"""Monitor a fow.co.uk saved search and notify for new listings."""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Iterable
from urllib import parse, request, robotparser

from bs4 import BeautifulSoup
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

SEARCH_URL = (
    "https://www.fow.co.uk/vehicle-search?finance_deposit=&finance_deposit_type=&finance_mileage="
    "&finance_search_only=&finance_term=&make=honda&max_price=14000&monthly_to=&resultsPerPage=10"
    "&reserved=&search=&sort=price%7Casc&transmission=AUTOMATIC&vrm_partial=&page=1"
)
STATE_PATH = Path("state.json")
MAX_SUMMARY_LISTINGS = 10
REQUEST_TIMEOUT_MS = 45_000

# Matching rules (edit these as needed)
MATCH_CONFIG = {
    "max_price_gbp": 14_000,  # default requirement from user
    "max_mileage": None,
    "min_year": None,
    "include_keywords": [],
    "exclude_keywords": [],
}


@dataclass
class Listing:
    listing_id: str
    title: str
    price_gbp: int | None
    mileage: int | None
    year: int | None
    url: str | None
    seen_at_utc: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_state(path: Path) -> set[str]:
    if not path.exists():
        return set()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        seen_ids = raw.get("seen_ids", [])
        return {str(x) for x in seen_ids}
    except Exception as exc:  # noqa: BLE001 - tolerant state loading
        print(f"WARN: Could not parse state file, starting fresh: {exc}")
        return set()


def save_state(path: Path, seen_ids: Iterable[str]) -> None:
    payload = {"seen_ids": sorted(set(seen_ids))}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def is_allowed_by_robots(url: str, user_agent: str = "*") -> tuple[bool, str]:
    parsed = parse.urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    rp = robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        allowed = rp.can_fetch(user_agent, url)
        return allowed, robots_url
    except Exception as exc:  # noqa: BLE001
        return False, f"{robots_url} (failed to read: {exc})"


def polite_delay() -> None:
    seconds = random.uniform(2.0, 7.0)
    print(f"Sleeping {seconds:.1f}s before fetch (polite delay).")
    time.sleep(seconds)


def normalize_url(base_url: str, href: str | None) -> str | None:
    if not href:
        return None
    absolute = parse.urljoin(base_url, href)
    split = parse.urlsplit(absolute)
    cleaned = parse.urlunsplit((split.scheme, split.netloc, split.path.rstrip("/"), split.query, ""))
    return cleaned


def parse_int_from_text(text: str) -> int | None:
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def extract_year(text: str) -> int | None:
    match = re.search(r"\b(19\d{2}|20\d{2})\b", text)
    if not match:
        return None
    year = int(match.group(1))
    if 1980 <= year <= datetime.now().year + 1:
        return year
    return None


def extract_stock_id(url: str | None, card_text: str) -> str | None:
    if url:
        parsed = parse.urlsplit(url)
        path = parsed.path
        query = parse.parse_qs(parsed.query)

        for key in ("stock", "stockid", "vehicleid", "id", "vid"):
            values = query.get(key)
            if values and values[0]:
                return f"stock:{values[0]}"

        slug_match = re.search(r"(?:stock|vehicle|car)[-_]?(\d{4,})", path, re.IGNORECASE)
        if slug_match:
            return f"stock:{slug_match.group(1)}"

        trailing_digits = re.search(r"/(\d{4,})(?:$|[/?#])", path)
        if trailing_digits:
            return f"stock:{trailing_digits.group(1)}"

    text_match = re.search(r"\b(?:stock|vehicle)\s*(?:no\.?|id)?\s*[:#-]?\s*([A-Z0-9-]{4,})\b", card_text, re.IGNORECASE)
    if text_match:
        return f"stock:{text_match.group(1)}"

    return None


def listing_id_for(url: str | None, title: str, price_gbp: int | None) -> str:
    stock_id = extract_stock_id(url, title)
    if stock_id:
        return stock_id
    if url:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
        return f"urlhash:{digest}"
    digest_input = f"{title}|{price_gbp or ''}"
    digest = hashlib.sha256(digest_input.encode("utf-8")).hexdigest()[:16]
    return f"fallback:{digest}"


def parse_listing_from_card(card, base_url: str, seen_at_utc: str) -> Listing | None:
    link = card.select_one("a[href]")
    url = normalize_url(base_url, link.get("href") if link else None)

    title_node = card.select_one("h2, h3, h4, [class*='title'], [data-testid*='title']")
    title = (title_node.get_text(" ", strip=True) if title_node else "") or card.get_text(" ", strip=True)
    title = re.sub(r"\s+", " ", title).strip()
    if not title:
        return None

    text = card.get_text(" ", strip=True)

    price_match = re.search(r"£\s*([\d,]+)", text)
    price_gbp = int(price_match.group(1).replace(",", "")) if price_match else None

    mileage_match = re.search(r"([\d,]+)\s*miles?", text, flags=re.IGNORECASE)
    mileage = int(mileage_match.group(1).replace(",", "")) if mileage_match else None

    year = extract_year(text)
    listing_id = listing_id_for(url, title, price_gbp)

    return Listing(
        listing_id=listing_id,
        title=title,
        price_gbp=price_gbp,
        mileage=mileage,
        year=year,
        url=url,
        seen_at_utc=seen_at_utc,
    )


def fetch_listings_with_playwright(search_url: str) -> tuple[list[Listing], int]:
    parse_failures = 0
    seen_at_utc = utc_now_iso()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(search_url, wait_until="domcontentloaded", timeout=REQUEST_TIMEOUT_MS)
        try:
            page.wait_for_load_state("networkidle", timeout=REQUEST_TIMEOUT_MS)
        except PlaywrightTimeoutError:
            print("WARN: networkidle timeout; continuing with current DOM")

        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "lxml")

    cards = soup.select("article, li, div")
    listings: list[Listing] = []
    seen_ids_local: set[str] = set()

    for card in cards:
        anchor = card.select_one("a[href]")
        if not anchor:
            continue

        href = anchor.get("href") or ""
        if not re.search(r"(vehicle|used|car)", href, re.IGNORECASE):
            continue

        listing = parse_listing_from_card(card, search_url, seen_at_utc)
        if not listing:
            parse_failures += 1
            continue

        if listing.listing_id in seen_ids_local:
            continue

        seen_ids_local.add(listing.listing_id)
        listings.append(listing)

    return listings, parse_failures


def listing_matches(listing: Listing, cfg: dict) -> bool:
    max_price = cfg.get("max_price_gbp")
    if max_price is not None and listing.price_gbp is not None and listing.price_gbp > max_price:
        return False

    max_mileage = cfg.get("max_mileage")
    if max_mileage is not None and listing.mileage is not None and listing.mileage > max_mileage:
        return False

    min_year = cfg.get("min_year")
    if min_year is not None and listing.year is not None and listing.year < min_year:
        return False

    text = f"{listing.title} {listing.url or ''}".lower()
    include_keywords = [kw.lower() for kw in cfg.get("include_keywords", []) if kw]
    exclude_keywords = [kw.lower() for kw in cfg.get("exclude_keywords", []) if kw]

    if include_keywords and not any(kw in text for kw in include_keywords):
        return False

    if exclude_keywords and any(kw in text for kw in exclude_keywords):
        return False

    return True


def telegram_send(message: str) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        print("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set. Message follows:\n")
        print(message)
        return

    endpoint = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = parse.urlencode({
        "chat_id": chat_id,
        "text": message,
        "disable_web_page_preview": "true",
    }).encode("utf-8")

    req = request.Request(endpoint, data=payload, method="POST")
    with request.urlopen(req, timeout=20) as resp:  # noqa: S310 - expected https URL
        body = resp.read().decode("utf-8", errors="replace")
        if resp.status >= 400:
            raise RuntimeError(f"Telegram send failed ({resp.status}): {body}")


def build_summary_message(new_matches: list[Listing], total_new: int, total_found: int) -> str:
    lines = [
        f"FOW watcher update: {len(new_matches)} matching new listing(s)",
        f"Total listings found this run: {total_found}",
        f"Total new listings this run: {total_new}",
        "",
    ]
    for idx, listing in enumerate(new_matches[:MAX_SUMMARY_LISTINGS], start=1):
        price = f"£{listing.price_gbp:,}" if listing.price_gbp is not None else "N/A"
        mileage = f"{listing.mileage:,} miles" if listing.mileage is not None else "N/A"
        year = str(listing.year) if listing.year is not None else "N/A"
        url = listing.url or "N/A"
        lines.append(f"{idx}. {escape(listing.title)}")
        lines.append(f"   Price: {price} | Mileage: {mileage} | Year: {year}")
        lines.append(f"   {url}")
        lines.append("")

    overflow = len(new_matches) - MAX_SUMMARY_LISTINGS
    if overflow > 0:
        lines.append(f"...and {overflow} more matching listing(s).")

    return "\n".join(lines).strip()


def notify_not_allowed(search_url: str, robots_source: str) -> None:
    message = (
        "FOW watcher safety fallback: Monitoring skipped because robots/allowed-access checks did "
        f"not permit fetching this URL.\nURL: {search_url}\nRobots source: {robots_source}"
    )
    print(message)
    telegram_send(message)


def main() -> int:
    seen_ids = load_state(STATE_PATH)

    allowed, robots_source = is_allowed_by_robots(SEARCH_URL, user_agent="*")
    if not allowed:
        notify_not_allowed(SEARCH_URL, robots_source)
        save_state(STATE_PATH, seen_ids)
        return 0

    polite_delay()

    listings, parse_failures = fetch_listings_with_playwright(SEARCH_URL)
    current_ids = {listing.listing_id for listing in listings}

    new_listings = [listing for listing in listings if listing.listing_id not in seen_ids]
    new_matches = [listing for listing in new_listings if listing_matches(listing, MATCH_CONFIG)]

    if new_matches:
        msg = build_summary_message(new_matches, total_new=len(new_listings), total_found=len(listings))
        telegram_send(msg)

    seen_union = seen_ids.union(current_ids)
    save_state(STATE_PATH, seen_union)

    print(
        "Run summary: "
        f"found={len(listings)} "
        f"new={len(new_listings)} "
        f"new_matches={len(new_matches)} "
        f"parse_failures={parse_failures}"
    )

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted.")
        raise SystemExit(130)
