// GET /api/register/check-slug?slug=musterbau
// Live-Prüfung im Registrierungsformular ("verfügbar" / "vergeben").
import { NextRequest, NextResponse } from "next/server";
import { checkSlugAvailability } from "@/lib/slug";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!slug) {
    return NextResponse.json({ error: "invalid_payload", fields: ["slug"] }, { status: 422 });
  }
  const result = await checkSlugAvailability(slug);
  return NextResponse.json(result);
}
