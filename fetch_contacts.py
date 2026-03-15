#!/usr/bin/env python3
"""
Fetch contacts from Apollo.io and return their names and emails.

Requires APOLLO_API_KEY in .env (copy from .env.example).
Uses Apollo's Search for Contacts API: https://docs.apollo.io/reference/search-for-contacts
"""

import os
import re
import sys
import json
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = "https://api.apollo.io/api/v1"
SEARCH_CONTACTS = f"{API_BASE}/contacts/search"
MAX_PAGES = 500
PER_PAGE = 100
DEFAULT_BLACKLIST_PATH = Path(__file__).resolve().parent / "blacklist.txt"


def get_contacts(page: int = 1, per_page: int = PER_PAGE, **filters) -> dict:
    """Call Apollo Search for Contacts API. Returns raw API response."""
    api_key = os.environ.get("APOLLO_API_KEY")
    if not api_key:
        print("Set APOLLO_API_KEY in .env (see .env.example)", file=sys.stderr)
        sys.exit(1)

    payload = {"page": page, "per_page": per_page, **filters}
    resp = requests.post(
        SEARCH_CONTACTS,
        headers={"Content-Type": "application/json", "x-api-key": api_key},
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# Fields we extract from each contact
EXTRACTED_FIELDS = [
    "name",
    "email",
    "linkedin_url",
    "title",
    "headline",
    "organization_name",
]


def load_blacklist(path: Path | None = None) -> set[str]:
    """Load blacklist identifiers from file (one per line, comments with # ignored). Returns lowercase set."""
    path = path or DEFAULT_BLACKLIST_PATH
    if not path.exists():
        return set()
    seen: set[str] = set()
    with open(path) as f:
        for line in f:
            line = line.split("#")[0].strip()
            if line:
                seen.add(line.lower())
    return seen


def _normalize(s: str) -> str:
    """Lowercase, remove underscores/dots/spaces for fuzzy matching."""
    return re.sub(r"[_.\s]", "", (s or "").lower())


def is_blacklisted(contact: dict, blacklist: set[str]) -> bool:
    """True if contact matches any blacklist entry (exact or fuzzy: email, LinkedIn, name)."""
    if not blacklist:
        return False
    name = (contact.get("name") or "").strip()
    name_norm = _normalize(name)
    email = (contact.get("email") or "").strip()
    local = email.split("@")[0].lower() if email else ""
    local_norm = _normalize(local)
    url = (contact.get("linkedin_url") or "").strip()
    slug = ""
    if url:
        m = re.search(r"/in/([^/?]+)", url, re.IGNORECASE)
        if m:
            slug = m.group(1).lower()
    slug_norm = _normalize(slug)

    for entry in blacklist:
        en = _normalize(entry)
        if not en:
            continue
        # Exact match
        if local == entry.lower() or slug == entry.lower():
            return True
        # Fuzzy: blacklist entry (or its long parts) contained in contact data only (avoid short name false positives)
        if len(en) >= 4 and (en in local_norm or en in slug_norm or en in name_norm):
            return True
        # Short blacklist e.g. "joyi": only match if contained in email/local or linkedin slug (not name)
        if len(en) < 4 and (en in local_norm or en in slug_norm):
            return True
        # Blacklist like "j_huff" -> parts ["huff"]; if any part (len>=4) in name_norm, match
        parts = [p for p in re.split(r"[_.]", entry.lower()) if len(p) >= 4]
        if any(p in name_norm for p in parts):
            return True
    return False


def contact_to_record(c: dict) -> dict:
    """Extract name, email, linkedin, title, headline, and company from a contact."""
    name = c.get("name") or f"{c.get('first_name', '')} {c.get('last_name', '')}".strip()
    return {
        "name": name,
        "email": c.get("email"),
        "linkedin_url": c.get("linkedin_url"),
        "title": c.get("title"),
        "headline": c.get("headline"),
        "organization_name": c.get("organization_name"),
    }


def fetch_all_contacts(**filters) -> list[dict]:
    """Paginate through Search for Contacts and collect name + email for each contact."""
    results = []
    page = 1

    while page <= MAX_PAGES:
        data = get_contacts(page=page, **filters)
        contacts = data.get("contacts") or []
        if not contacts:
            break
        for c in contacts:
            results.append(contact_to_record(c))
        total = data.get("pagination", {}).get("total_entries", 0)
        if page * len(contacts) >= total:
            break
        page += 1

    return results


def group_contacts_by_organization(contacts: list[dict]) -> dict[str, list[dict]]:
    """Group contacts by organization_name. Key = company name, value = list of contacts."""
    by_org: dict[str, list[dict]] = {}
    for c in contacts:
        org = c.get("organization_name") or "Unknown"
        if org not in by_org:
            by_org[org] = []
        by_org[org].append(c)
    return by_org


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fetch Apollo contacts and save by company to JSON.")
    parser.add_argument("-o", "--output", default="contacts_by_company.json", help="Output JSON file (default: contacts_by_company.json)")
    parser.add_argument("--blacklist", type=Path, default=None, help=f"Path to blacklist file (default: {DEFAULT_BLACKLIST_PATH.name})")
    parser.add_argument("--csv", action="store_true", help="Also print a flat CSV to stdout")
    parser.add_argument("--per-page", type=int, default=100, help="Results per page (default 100)")
    args = parser.parse_args()

    filters = {"per_page": args.per_page}
    contacts = fetch_all_contacts(**filters)
    blacklist = load_blacklist(args.blacklist)
    contacts = [c for c in contacts if not is_blacklisted(c, blacklist)]
    if blacklist:
        print(f"Filtered by blacklist ({len(blacklist)} entries)", file=sys.stderr)
    by_company = group_contacts_by_organization(contacts)

    with open(args.output, "w") as f:
        json.dump(by_company, f, indent=2)

    print(f"Saved {len(contacts)} contacts from {len(by_company)} companies to {args.output}", file=sys.stderr)

    if args.csv:
        import csv
        if contacts:
            w = csv.DictWriter(sys.stdout, fieldnames=EXTRACTED_FIELDS, extrasaction="ignore")
            w.writeheader()
            w.writerows(contacts)


if __name__ == "__main__":
    main()
