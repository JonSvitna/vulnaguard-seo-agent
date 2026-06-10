"""
PostgreSQL client for Python marketing agents.
Connects to the same DATABASE_URL used by the Next.js SEO agent repo.
"""

import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL", "")


@contextmanager
def get_conn():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_config(key: str, default=None) -> str:
    with get_conn() as conn:
        with conn.cursor() as c:
            c.execute("SELECT value FROM agent_config WHERE key = %s", (key,))
            row = c.fetchone()
            return row["value"] if row else default


def set_config(key: str, value: str):
    with get_conn() as conn:
        with conn.cursor() as c:
            c.execute("""
                INSERT INTO agent_config (key, value, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """, (key, value))


def init_db():
    with get_conn() as conn:
        with conn.cursor() as c:
            defaults = [
                ("llm_provider", "claude"),
                ("llm_tier", "balanced"),
                ("qualifier_min_score", "6"),
                ("sequence_delay_days", "4,9"),
                ("daily_send_limit", "50"),
                ("batch_size", "10"),
            ]
            for key, value in defaults:
                c.execute("""
                    INSERT INTO agent_config (key, value) VALUES (%s, %s)
                    ON CONFLICT (key) DO NOTHING
                """, (key, value))
    print("[DB] Connected to Postgres and seeded default config")


if __name__ == "__main__":
    init_db()
