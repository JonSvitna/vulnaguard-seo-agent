"""
Scout Agent — Lead Discovery
Scrapes CMMC-AB Marketplace via Apify, extracts entities with spaCy,
stores structured leads in the database.
"""

import os
import json
import time
import requests
import spacy
from typing import Optional
from db.database import get_conn, get_config

APIFY_API_KEY = os.environ.get("APIFY_API_KEY", "")
CMMC_AB_URL = "https://marketplace.cmmcab.org/providers"

# Apify actor for generic web scraping
APIFY_ACTOR = "apify/cheerio-scraper"


class ScoutAgent:
    def __init__(self):
        self.name = "Scout"
        print(f"[{self.name}] Loading spaCy model...")
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            print(f"[{self.name}] spaCy model not found. Run: python -m spacy download en_core_web_sm")
            raise

    def run_apify_scrape(self, url: str) -> list[dict]:
        """Run Apify cheerio scraper against CMMC-AB marketplace."""
        print(f"[{self.name}] Starting Apify scrape of {url}")

        if not APIFY_API_KEY:
            print(f"[{self.name}] No APIFY_API_KEY — using mock data")
            return self._mock_data()

        # Start Apify actor run
        run_res = requests.post(
            f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/runs",
            headers={"Authorization": f"Bearer {APIFY_API_KEY}"},
            json={
                "startUrls": [{"url": url}],
                "pageFunction": """
                    async function pageFunction(context) {
                        const { $ } = context;
                        const results = [];
                        $('.provider-card, .listing-card, .org-card').each((i, el) => {
                            results.push({
                                name: $(el).find('.name, h2, h3').first().text().trim(),
                                description: $(el).find('.description, .bio, p').first().text().trim(),
                                location: $(el).find('.location, .city, .state').first().text().trim(),
                                website: $(el).find('a[href^="http"]').first().attr('href') || '',
                                type: $(el).find('.type, .category, .badge').first().text().trim(),
                                contact: $(el).find('.contact, .email').first().text().trim(),
                            });
                        });
                        return results;
                    }
                """,
                "maxCrawlingDepth": 2,
                "maxPagesPerCrawl": 50,
            }
        )

        if run_res.status_code != 201:
            print(f"[{self.name}] Apify error: {run_res.text}")
            return self._mock_data()

        run_id = run_res.json()["data"]["id"]
        print(f"[{self.name}] Apify run started: {run_id}")

        # Poll for completion
        for _ in range(30):
            time.sleep(10)
            status_res = requests.get(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR}/runs/{run_id}",
                headers={"Authorization": f"Bearer {APIFY_API_KEY}"}
            )
            status = status_res.json()["data"]["status"]
            print(f"[{self.name}] Run status: {status}")
            if status == "SUCCEEDED":
                break
            if status in ("FAILED", "ABORTED", "TIMED-OUT"):
                print(f"[{self.name}] Apify run failed: {status}")
                return self._mock_data()

        # Fetch results
        dataset_id = status_res.json()["data"]["defaultDatasetId"]
        items_res = requests.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items",
            headers={"Authorization": f"Bearer {APIFY_API_KEY}"}
        )
        return items_res.json()

    def extract_entities(self, raw_items: list[dict]) -> list[dict]:
        """Use spaCy to extract and enrich entity data from scraped text."""
        print(f"[{self.name}] Extracting entities from {len(raw_items)} items with spaCy...")
        enriched = []

        for item in raw_items:
            text = f"{item.get('name', '')} {item.get('description', '')} {item.get('location', '')}"
            doc = self.nlp(text)

            # Extract named entities
            orgs = [ent.text for ent in doc.ents if ent.label_ == "ORG"]
            locations = [ent.text for ent in doc.ents if ent.label_ in ("GPE", "LOC")]
            persons = [ent.text for ent in doc.ents if ent.label_ == "PERSON"]

            # Detect CMMC level signals
            cmmc_level = "Unknown"
            text_lower = text.lower()
            if "level 3" in text_lower or "advanced" in text_lower:
                cmmc_level = "Level 3"
            elif "level 2" in text_lower or "advanced" in text_lower:
                cmmc_level = "Level 2"
            elif "level 1" in text_lower or "foundational" in text_lower:
                cmmc_level = "Level 1"

            # Detect org type — filter out C3PAOs and consultants
            org_type = item.get("type", "").lower()
            is_target = not any(x in org_type for x in ["c3pao", "consultant", "assessor", "rpo"])

            if not is_target:
                continue

            enriched.append({
                "company_name": item.get("name") or (orgs[0] if orgs else "Unknown"),
                "website": item.get("website", ""),
                "location": item.get("location") or (locations[0] if locations else ""),
                "org_type": item.get("type", "OSC"),  # Organization Seeking Certification
                "cmmc_level_sought": cmmc_level,
                "employee_count": "< 50",  # Target size
                "contact_name": persons[0] if persons else "",
                "contact_title": "",
                "contact_email": item.get("contact", ""),
                "contact_linkedin": "",
                "source": "cmmc_ab",
            })

        print(f"[{self.name}] Extracted {len(enriched)} target leads (filtered non-OSCs)")
        return enriched

    def save_leads(self, leads: list[dict]) -> int:
        """Save new leads to database, skip duplicates."""
        conn = get_conn()
        saved = 0
        for lead in leads:
            existing = conn.execute(
                "SELECT id FROM leads WHERE company_name = ?", (lead["company_name"],)
            ).fetchone()
            if existing:
                continue
            conn.execute("""
                INSERT INTO leads (company_name, website, location, org_type,
                    cmmc_level_sought, employee_count, contact_name, contact_title,
                    contact_email, contact_linkedin, source, status)
                VALUES (:company_name, :website, :location, :org_type,
                    :cmmc_level_sought, :employee_count, :contact_name, :contact_title,
                    :contact_email, :contact_linkedin, :source, 'discovered')
            """, lead)
            saved += 1
        conn.commit()
        conn.close()
        print(f"[{self.name}] Saved {saved} new leads to database")
        return saved

    def run(self) -> dict:
        """Full scout run: scrape → extract → save."""
        print(f"\n[{self.name}] Starting lead discovery run...")
        raw = self.run_apify_scrape(CMMC_AB_URL)
        leads = self.extract_entities(raw)
        saved = self.save_leads(leads)
        return {"agent": "scout", "leads_found": len(leads), "leads_saved": saved}

    def _mock_data(self) -> list[dict]:
        """Mock CMMC-AB data for testing without Apify key."""
        return [
            {"name": "Apex Defense Solutions LLC", "description": "Small defense subcontractor seeking CMMC Level 2 certification for CUI handling.", "location": "Huntsville, AL", "website": "https://apexdefense.example.com", "type": "OSC", "contact": ""},
            {"name": "TechShield Systems Inc", "description": "IT services provider for DoD primes, pursuing CMMC Level 2.", "location": "Tysons Corner, VA", "website": "https://techshield.example.com", "type": "OSC", "contact": ""},
            {"name": "BlueStar Federal Group", "description": "Logistics and supply chain for defense contractors. CMMC Level 1 assessment scheduled.", "location": "San Antonio, TX", "website": "https://bluestarfed.example.com", "type": "OSC", "contact": ""},
            {"name": "Precision Defense Corp", "description": "Manufacturing subcontractor with active DoD contracts. Level 2 compliance required by contract.", "location": "Baltimore, MD", "website": "https://precisiondefense.example.com", "type": "OSC", "contact": ""},
            {"name": "AcmeSec Consulting Group", "description": "CMMC-AB Registered Provider Organization helping contractors.", "location": "Arlington, VA", "website": "", "type": "RPO", "contact": ""},  # Should be filtered out
        ]


if __name__ == "__main__":
    from db.database import init_db
    init_db()
    agent = ScoutAgent()
    result = agent.run()
    print(f"\nResult: {result}")
