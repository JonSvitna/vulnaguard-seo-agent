"""
Sender Agent — Batch Approval & SMTP Dispatch
Sends approved email sequences via SMTP.
LinkedIn dispatch via API (or Phantombuster fallback).
"""

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from db.database import get_conn, get_config

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER)


class SenderAgent:
    def __init__(self):
        self.name = "Sender"
        self.daily_limit = int(get_config("daily_send_limit", "50"))

    def send_email(self, to_email: str, subject: str, body: str) -> bool:
        """Send a single email via SMTP."""
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
            print(f"[{self.name}] SMTP not configured — dry run for {to_email}")
            print(f"  Subject: {subject}")
            print(f"  Body preview: {body[:100]}...")
            return True  # Dry run success

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = to_email

            # Plain text + basic HTML
            text_part = MIMEText(body, "plain")
            html_body = body.replace("\n", "<br>")
            html_part = MIMEText(f"<html><body><p>{html_body}</p></body></html>", "html")
            msg.attach(text_part)
            msg.attach(html_part)

            context = ssl.create_default_context()
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls(context=context)
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, to_email, msg.as_string())

            return True
        except Exception as e:
            print(f"[{self.name}] SMTP error sending to {to_email}: {e}")
            return False

    def get_approved_sequences(self) -> list[dict]:
        """Get all approved sequences with their first pending email."""
        conn = get_conn()
        rows = conn.execute("""
            SELECT 
                s.id as sequence_id,
                l.id as lead_id,
                l.company_name,
                l.contact_email,
                l.contact_name,
                e.id as email_id,
                e.subject,
                e.body,
                e.touch_number,
                e.scheduled_at
            FROM sequences s
            JOIN leads l ON s.lead_id = l.id
            JOIN emails e ON e.sequence_id = s.id
            WHERE s.status = 'approved'
              AND e.status = 'drafted'
              AND l.contact_email != ''
              AND l.contact_email IS NOT NULL
              AND (e.scheduled_at <= datetime('now') OR e.touch_number = 1)
            ORDER BY e.touch_number ASC
            LIMIT ?
        """, (self.daily_limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def run(self) -> dict:
        """Send all approved emails due today."""
        print(f"\n[{self.name}] Starting send run (limit: {self.daily_limit}/day)...")
        emails = self.get_approved_sequences()
        print(f"[{self.name}] Found {len(emails)} emails ready to send")

        sent = 0
        failed = 0
        conn = get_conn()

        for email in emails:
            if not email["contact_email"]:
                continue

            success = self.send_email(
                to_email=email["contact_email"],
                subject=email["subject"],
                body=email["body"]
            )

            if success:
                conn.execute(
                    "UPDATE emails SET status = 'sent', sent_at = datetime('now') WHERE id = ?",
                    (email["email_id"],)
                )
                conn.execute(
                    "UPDATE leads SET status = 'sent', updated_at = datetime('now') WHERE id = ?",
                    (email["lead_id"],)
                )
                sent += 1
                print(f"[{self.name}] ✓ Sent touch {email['touch_number']} to {email['company_name']}")
            else:
                failed += 1

        conn.commit()
        conn.close()

        print(f"[{self.name}] Done: {sent} sent, {failed} failed")
        return {"agent": "sender", "sent": sent, "failed": failed}

    def get_pending_approval_batches(self, batch_size: int = 10) -> list[dict]:
        """Get drafted sequences grouped for approval UI."""
        conn = get_conn()
        sequences = conn.execute("""
            SELECT 
                s.id,
                l.company_name,
                l.location,
                l.cmmc_level_sought,
                l.score,
                l.contact_email,
                l.contact_name,
                s.created_at
            FROM sequences s
            JOIN leads l ON s.lead_id = l.id
            WHERE s.status = 'drafted'
            ORDER BY l.score DESC
            LIMIT ?
        """, (batch_size,)).fetchall()

        result = []
        for seq in sequences:
            seq = dict(seq)
            emails = conn.execute(
                "SELECT touch_number, subject, body FROM emails WHERE sequence_id = ? ORDER BY touch_number",
                (seq["id"],)
            ).fetchall()
            linkedin = conn.execute(
                "SELECT message FROM linkedin_messages WHERE sequence_id = ?",
                (seq["id"],)
            ).fetchone()

            seq["emails"] = [dict(e) for e in emails]
            seq["linkedin_message"] = linkedin["message"] if linkedin else ""
            result.append(seq)

        conn.close()
        return result

    def approve_sequences(self, sequence_ids: list[int]) -> int:
        """Mark sequences as approved — ready to send."""
        conn = get_conn()
        for sid in sequence_ids:
            conn.execute(
                "UPDATE sequences SET status = 'approved', approved_at = datetime('now') WHERE id = ?",
                (sid,)
            )
            conn.execute("""
                UPDATE leads SET status = 'approved', updated_at = datetime('now')
                WHERE id = (SELECT lead_id FROM sequences WHERE id = ?)
            """, (sid,))
        conn.commit()
        conn.close()
        return len(sequence_ids)


if __name__ == "__main__":
    from db.database import init_db
    init_db()
    agent = SenderAgent()

    # Show pending approvals
    batches = agent.get_pending_approval_batches()
    print(f"Pending approval: {len(batches)} sequences")
    for b in batches:
        print(f"  - {b['company_name']} (score: {b['score']}) — {len(b['emails'])} emails")
