// POST /api/register
// Nimmt das Registrierungsformular an, wählt eine freie Pool-Instanz,
// ruft assign() auf und meldet direkt danach billing(ACTIVE) -- siehe
// Abschnitte "Endpunkt assign", "Free-Lebenszyklus → Registrierung".
//
// Mit CORS, weil das native Registrierungs-Popup auf braain.io (eigener
// Origin, World4You) diesen Endpunkt direkt per fetch() aufruft.
import { NextRequest, NextResponse } from "next/server";
import { assignInstance, reportBilling } from "@/lib/braainClient";
import {
  findExistingCustomerByEmail,
  insertPendingCustomer,
  logInstanceCall,
  markCustomerActive,
  newCustomerRef,
  newEventId,
} from "@/lib/customerRegister";
import {
  markInstanceAssigned,
  markInstanceAssignedToUnknownCustomer,
  pickFreeInstance,
} from "@/lib/poolRegister";
import { checkSlugAvailability } from "@/lib/slug";
import { corsHeaders, handleCorsPreflight } from "@/lib/cors";

export const runtime = "nodejs";

const FREE_PLAN = "FREE" as const;
const FREE_QUOTA = 30;
const MAX_ASSIGN_ATTEMPTS = 3;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsPreflight(req) ?? new Response(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }

  const company = typeof payload.company === "string" ? payload.company.trim() : "";
  const adminEmail = typeof payload.adminEmail === "string" ? payload.adminEmail.trim() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase() : "";

  const fields: string[] = [];
  if (company.length < 1 || company.length > 200) fields.push("company");
  if (!isValidEmail(adminEmail)) fields.push("adminEmail");

  const slugCheck = await checkSlugAvailability(slug);
  // Ungültiges Format oder ein reservierter Name sind Eingabefehler (422);
  // "vergeben" ist ein echter Konflikt mit einem anderen Kunden (409).
  if (!slugCheck.valid || slugCheck.reason === "reserved") fields.push("slug");

  if (fields.length > 0) {
    return NextResponse.json({ error: "invalid_payload", fields }, { status: 422, headers });
  }
  if (!slugCheck.available) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409, headers });
  }

  // Zweitregistrierung mit derselben E-Mail (Abschnitt "Instanz-Pool →
  // Sonderfälle"). Volle Restore-Anbindung ist ein Folge-Schritt; hier wird
  // zumindest kein Doppel-Kunde angelegt.
  const existing = await findExistingCustomerByEmail(adminEmail);
  if (existing && existing.released_at === null) {
    return NextResponse.json(
      { error: "already_registered", customerRef: existing.customer_ref },
      { status: 409, headers },
    );
  }
  if (existing && existing.released_at !== null && existing.last_backup_id) {
    const releasedAt = new Date(existing.released_at as string);
    const daysSince = (Date.now() - releasedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 90) {
      return NextResponse.json(
        {
          error: "restorable_account_exists",
          customerRef: existing.customer_ref,
          backupId: existing.last_backup_id,
        },
        { status: 409, headers },
      );
    }
  }

  const customerRef = newCustomerRef();
  const eventId = newEventId("reg");
  const portalUrl = `${process.env.UPGRADE_PAGE_URL ?? "https://braain.io/upgrade"}?kunde=${customerRef}`;

  let lastError: { status: number; body: unknown } | null = null;

  for (let attempt = 1; attempt <= MAX_ASSIGN_ATTEMPTS; attempt++) {
    const instance = await pickFreeInstance();
    if (!instance) {
      // Pool leer -- siehe Abschnitt "Instanz-Pool → Sonderfälle". Die volle
      // Warteschlange mit automatischem Nachrücken bei release()/neuer
      // Instanz ist ein Folge-Schritt; aktuell bekommt der Kunde eine klare
      // Meldung und das Braain-Team sollte separat benachrichtigt werden.
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          message: "Deine Umgebung wird eingerichtet, du bekommst den Zugang per E-Mail.",
        },
        { status: 202, headers },
      );
    }

    const result = await assignInstance(instance.baseUrl, instance.secret, {
      eventId,
      customer: { ref: customerRef, company, adminEmail, slug },
      billing: { plan: FREE_PLAN, quota: FREE_QUOTA, trialEndsAt: null, portalUrl },
    });

    await logInstanceCall({
      eventId,
      instanceId: instance.instanceId,
      customerRef,
      path: "assign",
      httpStatus: result.status,
      ok: result.ok,
      errorCode: result.ok ? null : (result.body as { error?: string })?.error ?? null,
    });

    if (result.ok && (result.body as any).assigned) {
      const body = result.body as any;

      // Reihenfolge wichtig: pool_instances.assigned_customer_ref hat einen
      // Fremdschlüssel auf customers, also muss der Kunde zuerst existieren.
      await insertPendingCustomer({
        customerRef,
        company,
        adminEmail,
        slug,
        instanceId: instance.instanceId,
        plan: FREE_PLAN,
        quota: FREE_QUOTA,
        portalUrl,
      });
      await markInstanceAssigned(instance.instanceId, customerRef);

      // Direkt danach ACTIVE melden, damit kein Testphasen-Banner erscheint
      // (Abschnitt "Endpunkt assign").
      const billingEventId = newEventId("reg");
      const billingResult = await reportBilling(instance.baseUrl, instance.secret, {
        eventId: billingEventId,
        customerRef,
        status: "ACTIVE",
        plan: FREE_PLAN,
        quota: FREE_QUOTA,
        portalUrl,
      });
      await logInstanceCall({
        eventId: billingEventId,
        instanceId: instance.instanceId,
        customerRef,
        path: "billing",
        httpStatus: billingResult.status,
        ok: billingResult.ok,
        errorCode: billingResult.ok ? null : (billingResult.body as { error?: string })?.error ?? null,
      });
      if (billingResult.ok) {
        await markCustomerActive(customerRef, { plan: FREE_PLAN, quota: FREE_QUOTA, portalUrl });
      }
      // Wenn billing() fehlschlägt, bleibt der Kunde auf TRIAL stehen; das
      // holt der tägliche Cron-Job (status-Abgleich) später nach. Für die
      // Antwort an den Browser ist das unkritisch, da assign() selbst schon
      // erfolgreich war.

      return NextResponse.json(
        {
          ok: true,
          customerRef,
          slug,
          domain: body.domain,
          domainReady: body.domainReady,
          invited: body.invited,
          statusUrl: `/api/customer/${customerRef}/status`,
        },
        { headers },
      );
    }

    const errorCode = (result.body as { error?: string })?.error;
    if (errorCode === "already_assigned") {
      // Instanz war inzwischen vergeben -- im Register als zugeteilt
      // markieren (gehört jemand anderem) und die nächste freie probieren.
      await markInstanceAssignedToUnknownCustomer(instance.instanceId);
      lastError = { status: result.status, body: result.body };
      continue;
    }

    // 422 (Programmfehler auf unserer Seite) oder ein anderer Fehler:
    // nicht automatisch wiederholen, an den Browser durchreichen.
    lastError = { status: result.status, body: result.body };
    break;
  }

  return NextResponse.json(
    { error: "assign_failed", detail: lastError?.body ?? null },
    { status: 502, headers },
  );
}
