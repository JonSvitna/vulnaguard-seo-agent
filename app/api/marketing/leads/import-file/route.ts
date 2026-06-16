import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { detectProviderFromEnv, makeOpenAIClient, makeAnthropicClient } from "@/lib/ai-provider";

const LEAD_FIELDS = [
  "company_name",
  "website",
  "location",
  "org_type",
  "cmmc_level_sought",
  "employee_count",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_linkedin",
] as const;

type LeadField = (typeof LEAD_FIELDS)[number];
type ParsedRow = Record<string, string>;

function parseCSV(buffer: Buffer): ParsedRow[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as ParsedRow[];
}

function parseExcel(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: "" });
}

async function inferMapping(
  headers: string[],
  sampleRows: ParsedRow[]
): Promise<Record<LeadField, string | null>> {
  const prompt = `Given these CSV headers: ${JSON.stringify(headers)}
And sample rows: ${JSON.stringify(sampleRows.slice(0, 3))}

Map each target field to the best matching header name, or null if no good match exists.
Target fields: company_name, website, location, org_type, cmmc_level_sought, employee_count, contact_name, contact_title, contact_email, contact_linkedin

Respond with only valid JSON, no markdown fences, no explanation:
{ "company_name": "...", "website": "...", "location": "...", "org_type": "...", "cmmc_level_sought": "...", "employee_count": "...", "contact_name": "...", "contact_title": "...", "contact_email": "...", "contact_linkedin": "..." }`;

  const config = detectProviderFromEnv();
  let raw: string;

  if (config.provider === "openai") {
    const client = makeOpenAIClient();
    const res = await client.chat.completions.create({
      model: config.model,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    raw = res.choices[0]?.message?.content ?? "{}";
  } else {
    const client = makeAnthropicClient();
    const message = await client.messages.create({
      model: config.model,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
  }

  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean) as Record<LeadField, string | null>;
  } catch {
    const fallback = {} as Record<LeadField, string | null>;
    LEAD_FIELDS.forEach((f) => (fallback[f] = null));
    return fallback;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let rows: ParsedRow[];
    if (filename.endsWith(".csv")) {
      rows = parseCSV(buffer);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      rows = parseExcel(buffer);
    } else {
      return NextResponse.json({ error: "Unsupported file type. Use .csv, .xlsx, or .xls" }, { status: 400 });
    }

    if (!rows.length) {
      return NextResponse.json({ error: "File is empty or has no data rows" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const suggested_mapping = await inferMapping(headers, rows.slice(0, 3));

    return NextResponse.json({
      suggested_mapping,
      headers,
      sample_rows: rows.slice(0, 3),
      all_rows: rows,
      total_rows: rows.length,
    });
  } catch (err) {
    console.error("[marketing/leads/import-file]", err);
    return NextResponse.json({ error: "Failed to parse file. Please try again." }, { status: 500 });
  }
}
