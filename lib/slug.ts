// Regeln für die Wunschadresse (customer.slug), siehe Abschnitt
// "Wunschadresse → Registrierungsformular" der Spezifikation.
import { getDb } from "./db";

export const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "mail",
  "admin",
  "sandbox",
  "demo",
  "status",
  "help",
  "support",
  "shop",
  "clerk",
  "accounts",
  "clkmail",
  "braain",
  "test",
  // k01 bis k99
  ...Array.from({ length: 99 }, (_, i) => `k${String(i + 1).padStart(2, "0")}`),
]);

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$/;

export function isValidSlugFormat(slug: string): boolean {
  if (slug.length < 3 || slug.length > 30) return false;
  if (!SLUG_PATTERN.test(slug)) return false;
  return true;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// Vorschlag aus dem Firmennamen: Kleinbuchstaben, Umlaute -> ae/oe/ue/ss,
// Rechtsform entfernt, Sonderzeichen -> "-", mehrfache/führende/
// abschließende "-" bereinigt, auf 30 Zeichen gekappt.
export function suggestSlugFromCompanyName(company: string): string {
  let s = company.toLowerCase();

  s = s
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

  // Rechtsformen entfernen (am Wortende, mit oder ohne Punkte)
  s = s.replace(
    /\b(ges\.?m\.?b\.?h\.?|gmbh|gesmbh|kg|og|e\.?u\.?|ag|gesellschaft mit beschraenkter haftung)\b\.?/gi,
    " ",
  );

  s = s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (s.length > 30) s = s.slice(0, 30).replace(/-+$/g, "");
  if (s.length < 3) s = s.padEnd(3, "0"); // sehr kurze Namen auffüllen, Kunde kann ändern

  return s;
}

export interface SlugCheckResult {
  valid: boolean;
  available: boolean;
  reason?: "invalid_format" | "reserved" | "taken";
}

// Ein Slug ist belegt, solange ein Kunde ihn aktiv nutzt (released_at is
// null) ODER solange seine Instanz vor weniger als 90 Tagen zurückgegeben
// wurde und dabei ein Backup entstanden ist (Reservierung).
export async function checkSlugAvailability(slug: string): Promise<SlugCheckResult> {
  const normalized = slug.toLowerCase();

  if (!isValidSlugFormat(normalized)) {
    return { valid: false, available: false, reason: "invalid_format" };
  }
  if (isReservedSlug(normalized)) {
    return { valid: true, available: false, reason: "reserved" };
  }

  const db = getDb();
  const { rows } = await db.query(
    `select 1 from customers
      where slug = $1
        and (
          released_at is null
          or (last_backup_id is not null and released_at > now() - interval '90 days')
        )
      limit 1`,
    [normalized],
  );

  if (rows.length > 0) {
    return { valid: true, available: false, reason: "taken" };
  }
  return { valid: true, available: true };
}
