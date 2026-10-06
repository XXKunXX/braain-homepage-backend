// POST /api/pool/instances
// Wird vom Braain-Skript aufgerufen, wenn eine neue Instanz angelegt wird
// (Abschnitt "Instanz-Pool" der Spezifikation). Geschützt mit
// "Authorization: Bearer <POOL_REGISTRY_TOKEN>" -- diesen Token einmalig
// und nicht per Chat/Mail im Klartext an Thomas/Braain übergeben.
import { NextRequest, NextResponse } from "next/server";
import { upsertPoolInstance } from "@/lib/poolRegister";

export const runtime = "nodejs";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.POOL_REGISTRY_TOKEN;
  if (!expected) return false; // nicht konfiguriert -> niemals annehmen
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;
  return match[1] === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const instanceId = typeof body.instanceId === "string" ? body.instanceId.trim() : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  const region = typeof body.region === "string" ? body.region.trim() : null;

  const fields: string[] = [];
  if (!instanceId) fields.push("instanceId");
  // In Produktion ausschließlich https://*.braain.io; http://localhost
  // wird nur für lokale Tests gegen eine Fake-Instanz zugelassen.
  const validBaseUrl = /^https:\/\//.test(baseUrl) || /^http:\/\/localhost(:\d+)?/.test(baseUrl);
  if (!baseUrl || !validBaseUrl) fields.push("baseUrl");
  if (!secret || secret.length !== 64 || !/^[0-9a-f]+$/i.test(secret)) fields.push("secret");

  if (fields.length > 0) {
    return NextResponse.json({ error: "invalid_payload", fields }, { status: 422 });
  }

  await upsertPoolInstance({ instanceId, baseUrl, secret, region });

  return NextResponse.json({ ok: true }, { status: 201 });
}
