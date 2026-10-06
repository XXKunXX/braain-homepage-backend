// CORS-Hilfsfunktionen für die Endpunkte, die das native Registrierungs-
// Popup auf der braain.io-Hauptseite (World4You, eigener Origin) per fetch()
// direkt anspricht: check-slug, register, customer/:ref/status.
//
// Alle anderen Endpunkte (Pool-Register, interne Aufrufe) bleiben ohne CORS
// -- die sind nicht fürs Browser-Fetch von einer anderen Seite gedacht.
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "https://braain.io,https://www.braain.io")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

export function corsHeaders(origin: string | null): HeadersInit {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  const origin = req.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
