import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { runSendBatch } from "@/lib/send-batch";

// Approve now means SEND. Clicking Approve marks the sequence approved, schedules
// touch 1 for immediate send + the follow-up touches on their configured delays,
// then fires the send batch right away so touch 1 goes out without waiting on the
// background scheduler. The old separate "Release" step is gone — it was the reason
// approved leads sat in an "Awaiting Release" bucket and never sent.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let ids: number[] = Array.isArray(body.sequence_ids) ? body.sequence_ids : [];

    // Bulk "Approve & send all drafted" — select every drafted sequence whose lead
    // has a real email address. Email-only outreach: no-email leads never send.
    if (body.all === true) {
      const rows = await query<{ id: number }>(
        `SELECT s.id FROM sequences s JOIN leads l ON l.id = s.lead_id
         WHERE s.status = 'drafted' AND NULLIF(TRIM(l.contact_email), '') IS NOT NULL`
      );
      ids = rows.map((r) => r.id);
    }

    if (!ids.length) {
      return NextResponse.json({ error: "sequence_ids is required" }, { status: 400 });
    }

    // Only drafted → approved. Guards against re-approving (and thus re-sending) a
    // sequence that already went out.
    const updated = await query<{ id: number; lead_id: number }>(
      `UPDATE sequences SET status = 'approved', approved_at = NOW()
       WHERE id = ANY($1::int[]) AND status = 'drafted'
       RETURNING id, lead_id`,
      [ids]
    );
    const approvedIds = updated.map((s) => s.id);
    const leadIds = updated.map((s) => s.lead_id);

    if (!approvedIds.length) {
      return NextResponse.json({ ok: true, approved: 0, sent: 0, failed: 0, message: "No drafted sequences to approve" });
    }

    await query(
      `UPDATE leads SET status = 'approved', updated_at = NOW() WHERE id = ANY($1::int[])`,
      [leadIds]
    );

    // Schedule touches (formerly the /approval/release step). Touch 1 sends now;
    // later touches are spaced out by sequence_delay_days. Handles any touch count
    // instead of hardcoding 2/3 — a 4th touch would otherwise never get a scheduled_at.
    const configRows = await query<{ value: string }>(
      `SELECT value FROM agent_config WHERE key = 'sequence_delay_days'`
    );
    const delays = (configRows[0]?.value ?? "4,9,14")
      .split(",")
      .map((d) => Number(d.trim()))
      .filter(Number.isFinite);

    await query(
      `UPDATE emails SET scheduled_at = NOW() WHERE sequence_id = ANY($1::int[]) AND touch_number = 1`,
      [approvedIds]
    );

    const touchNumbers = await query<{ touch_number: number }>(
      `SELECT DISTINCT touch_number FROM emails WHERE sequence_id = ANY($1::int[]) AND touch_number > 1 ORDER BY touch_number`,
      [approvedIds]
    );
    for (const { touch_number } of touchNumbers) {
      const delayDays = delays[touch_number - 2] ?? delays[delays.length - 1] ?? (touch_number - 1) * 5;
      await query(
        `UPDATE emails SET scheduled_at = NOW() + make_interval(days => $2) WHERE sequence_id = ANY($1::int[]) AND touch_number = $3`,
        [approvedIds, delayDays, touch_number]
      );
    }

    // Send touch 1 immediately. runSendBatch is the same global batch the scheduler
    // runs; it respects the daily send limit and only claims email-addressable leads.
    let sent = 0;
    let failed = 0;
    try {
      const batch = await runSendBatch();
      sent = batch.sent;
      failed = batch.failed;
    } catch (err) {
      // Scheduling succeeded even if the immediate send hit a snag — the background
      // scheduler will retry the drafted touch-1 emails on its next pass.
      console.error("[marketing/approval/approve] immediate send batch failed", err);
    }

    return NextResponse.json({ ok: true, approved: approvedIds.length, sent, failed });
  } catch (err) {
    console.error("[marketing/approval/approve]", err);
    return NextResponse.json({ error: "Failed to approve sequences" }, { status: 500 });
  }
}
