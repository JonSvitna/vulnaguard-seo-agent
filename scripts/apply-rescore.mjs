// Applies the output of rescore-disqualified-leads.mjs to the leads table.
// Defaults to a dry run (transaction is rolled back, not committed) so you
// can see exactly what would change before it touches the live pipeline.
//
// Usage:
//   node --env-file=.env.local scripts/apply-rescore.mjs <path-to-csv>            # dry run
//   node --env-file=.env.local scripts/apply-rescore.mjs <path-to-csv> --commit  # actually writes

import { Pool } from "pg";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const csvPath = process.argv[2];
const commit = process.argv.includes("--commit");

if (!csvPath) {
  console.error("Usage: node --env-file=.env.local scripts/apply-rescore.mjs <path-to-csv> [--commit]");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /\blocalhost\b|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")
    ? false
    : { rejectUnauthorized: false },
  max: 5,
});

async function main() {
  const raw = readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  console.log(`Loaded ${rows.length} rows from ${csvPath}`);
  console.log(commit ? "Mode: COMMIT (writing to DB)" : "Mode: DRY RUN (will roll back)");

  const client = await pool.connect();
  const statusCounts = {};
  const categoryCounts = {};

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      const id = Number(row.id);
      const newScore = Number(row.new_score);
      const category = row.recommended_category;
      const status = row.suggested_status;
      const reasoning = row.reasoning;
      const tone = row.outreach_tone;

      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;

      await client.query(
        `UPDATE leads
         SET score = $1,
             score_reason = $2,
             category = $3,
             status = $4,
             outreach_intent = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [newScore, `[rescore 2026-06-23] ${reasoning}`, category, status, tone, id]
      );
    }

    console.log("\nResulting status counts:", statusCounts);
    console.log("Resulting category counts:", categoryCounts);

    if (commit) {
      await client.query("COMMIT");
      console.log("\nCommitted. Leads table updated.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDry run complete, nothing written. Re-run with --commit to apply.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
