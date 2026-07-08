import { NextRequest, NextResponse } from "next/server";
import { getNextUnposted } from "@/vulnaguard-marketing-agents/pipeline/content-pipeline";

export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") ?? "vulnaguard";

  const record = await getNextUnposted(brand);

  if (!record) {
    return NextResponse.json({ record: null });
  }

  return NextResponse.json({ record });
}
