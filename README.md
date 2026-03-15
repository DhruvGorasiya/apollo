# Apollo

Fetch your **contacts from Apollo.io** and return their **names** and **emails**.

## Goal

- Connect to your Apollo account (API or export).
- List the contacts you have in Apollo.
- Extract **names**, **emails**, **LinkedIn**, and other useful fields for each contact.
- Return the data (e.g. JSON, CSV, or in-app).

## What we extract

The script returns these fields for each contact:

| Field | Description |
|-------|-------------|
| **name** | Full name |
| **email** | Primary email |
| **linkedin_url** | Person's LinkedIn profile URL |
| **title** | Job title |
| **headline** | LinkedIn-style headline |
| **organization_name** | Company name |

## Options

1. **Apollo API** – Use the [Search for Contacts API](https://docs.apollo.io/reference/search-for-contacts) to search and paginate contacts and read `first_name`, `last_name`, `email` (and other fields if needed).
2. **CSV export** – Export contacts from Apollo's UI to CSV, then parse the file to get names and emails.

## Setup

- **API:** Get an API key from [Apollo Settings → API](https://app.apollo.io/#/settings/integrations/api) and store it in `.env` (e.g. `APOLLO_API_KEY=...`). Do not commit `.env`.
- **CSV:** Export from Apollo (People → filters → Export) and place the CSV in this repo (or point the script at its path).

## Output

The script writes a JSON file where **keys are company/organization names** and **values are lists of contacts** for that company. Each contact has: `name`, `email`, `linkedin_url`, `title`, `headline`, `organization_name`.

Example structure:

```json
{
  "Google": [
    { "name": "...", "email": "...", "linkedin_url": "...", "title": "...", "headline": "...", "organization_name": "Google" }
  ],
  "Acme Inc": [ ... ]
}
```

## Usage

1. Copy `.env.example` to `.env` and set your `APOLLO_API_KEY` (from [Apollo → Settings → API](https://app.apollo.io/#/settings/integrations/api)).
2. Install dependencies: `pip install -r requirements.txt`
3. Run the script:
   - `python fetch_contacts.py` — saves to `contacts_by_company.json` (default)
   - `python fetch_contacts.py -o my_contacts.json` — save to a different file
   - `python fetch_contacts.py --csv` — also print a flat CSV of all contacts to stdout

## Repo structure

- `README.md` – this file
- `fetch_contacts.py` – fetch contacts via Apollo API, return names and emails (JSON or CSV)
- `requirements.txt` – Python dependencies
- `.env.example` – example env vars (copy to `.env`, do not commit)
- `.gitignore` – ignores `.env`, venvs, `__pycache__`, CSVs
