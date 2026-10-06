// GET /api/register/check-slug?slug=musterbau
// Live-Prüfung im Registrierungsformular ("verfügbar" / "vergeben").
// Mit CORS, weil das native Registrierungs-Popup auf braain.io (eigener
// Origin, World4You) diesen Endpunkt direkt per fetch() aufruft.
import { NextRequest, NextResponse } from "next/server";
import { checkSlugAvailability } from "@/lib/slug";
import { corsHeaders, handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req) ?? new Response(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (!slug) {
    return NextResponse.json({ error: "invalid_payload", fields: ["slug"] }, { status: 422, headers });
  }
  const result = await checkSlugAvailability(slug);
  return NextResponse.json(result, { headers });
}
