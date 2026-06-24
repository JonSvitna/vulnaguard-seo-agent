import { NextResponse } from "next/server";
import { syncResendStatus } from "@/lib/sync-resend-status";

export async function POST() {
  try {
    const result = await syncResendStatus();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[marketing/sync-resend-status]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
