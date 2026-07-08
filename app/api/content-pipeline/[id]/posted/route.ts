import { NextRequest, NextResponse } from "next/server";
import {
  markIndieHackersPosted,
  markPlatformPosted,
} from "@/vulnaguard-marketing-agents/pipeline/content-pipeline";

const BUFFER_PLATFORMS = ["linkedin", "facebook", "instagram"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { platform, postedAt } = body;

  if (platform === "indiehackers") {
    const record = await markIndieHackersPosted(id, postedAt);
    return NextResponse.json({ success: true, record });
  }

  if (!BUFFER_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `platform must be one of ${BUFFER_PLATFORMS.join(", ")} or indiehackers` },
      { status: 400 }
    );
  }

  const record = await markPlatformPosted(id, platform, postedAt);
  return NextResponse.json({ success: true, record });
}
