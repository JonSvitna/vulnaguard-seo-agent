# Vulnaguard Marketing Agent Team

Autonomous cold outreach pipeline targeting small DIB subcontractors needing CMMC compliance.

## Agent Team

| Agent | Role |
|-------|------|
| Scout | Scrapes CMMC-AB Marketplace via Apify, extracts entities with spaCy |
| Qualifier | Scores leads 1–10, filters to score ≥ 6 |
| Copywriter | Writes 3-touch email sequence + LinkedIn message per lead |
| Sender | SMTP dispatch after batch approval |
| Orchestrator | Coordinates full pipeline, manages state |

## Stack
- **Scraping:** Apify (cheerio-scraper actor)
- **NLP:** spaCy (en_core_web_sm)
- **LLM:** Claude (primary) or OpenAI (toggle in dashboard)
- **Email:** SMTP
- **LinkedIn:** LinkedIn API / Phantombuster
- **DB:** SQLite
- **API:** FastAPI
- **Dashboard:** Next.js (vulnaguard-seo-agent project)

## Setup

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
cp .env.example .env
# Fill in your keys
python db/database.py  # Initialize DB
```

## Run

```bash
# Full pipeline (scout → qualify → write → await approval)
python pipeline/orchestrator.py

# Send approved sequences
python pipeline/orchestrator.py send

# Pipeline stats
python pipeline/orchestrator.py stats

# API server (for dashboard)
python api/server.py
```

## Pipeline Flow

```
CMMC-AB Marketplace
    ↓ Apify scrape
Raw listings
    ↓ spaCy NLP
Structured leads
    ↓ Qualifier (score ≥ 6)
Qualified leads
    ↓ Copywriter
3-touch sequences + LinkedIn message
    ↓ Dashboard approval (you review batches)
    ↓ Sender
SMTP + LinkedIn dispatch
    ↓ Reply tracking
```

## LLM Toggle

Switch between Claude and OpenAI via API:
```bash
curl -X POST http://localhost:8000/api/config/provider \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "tier": "balanced"}'
```

Or use the toggle in the dashboard settings.

## Daily Send Limit
Default: 50 emails/day (configurable in agent_config table or via API).
