// Client für die Provisioning-Schnittstelle einer Braain-Instanz
// (assign/billing/status/release/restore). Signierung exakt nach
// Abschnitt "Authentifizierung" der Spezifikation.
import { createHmac } from "node:crypto";

export type ProvisioningPath = "assign" | "billing" | "status" | "release" | "restore";

export interface BraainCallResult<T = unknown> {
  status: number;
  body: T;
  ok: boolean; // status < 400 (reine HTTP-Ebene, nicht "ok" im JSON-Body)
}

async function signedFetch<T = unknown>(
  baseUrl: string,
  secret: string,
  path: ProvisioningPath,
  method: "GET" | "POST",
  body?: unknown,
): Promise<BraainCallResult<T>> {
  const rawBody = method === "POST" ? JSON.stringify(body) : "";
  // Wichtig: immer die tatsächliche Uhrzeit verwenden, nie einen
  // gespeicherten alten Wert (Abschnitt "Idempotenz und Fehlerbehandlung").
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const res = await fetch(`${baseUrl}/api/provisioning/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-braain-timestamp": timestamp,
      "x-braain-signature": signature,
    },
    body: method === "POST" ? rawBody : undefined,
    // Laut Spezifikation kann release() bis zu 5 Minuten dauern.
    signal: AbortSignal.timeout(path === "release" ? 5 * 60_000 : 30_000),
  });

  let parsed: T;
  try {
    parsed = (await res.json()) as T;
  } catch {
    parsed = {} as T;
  }

  return { status: res.status, body: parsed, ok: res.status < 400 };
}

// ── assign ──────────────────────────────────────────────────────────────

export interface AssignPayload {
  eventId: string;
  customer: {
    ref: string;
    company: string;
    adminEmail: string;
    slug: string;
  };
  billing: {
    plan: "FREE" | "STARTER" | "PRO" | "BUSINESS";
    quota: number;
    trialEndsAt?: string | null;
    portalUrl?: string;
  };
}

export interface AssignResponseOk {
  ok: true;
  assigned: true;
  status: string;
  plan: string;
  quota: number;
  trialEndsAt: string | null;
  domain: string;
  domainReady: boolean;
  invited: boolean;
  inviteFailed: boolean;
}

export interface ErrorResponse {
  error: string;
  fields?: string[];
}

export function assignInstance(
  baseUrl: string,
  secret: string,
  payload: AssignPayload,
) {
  return signedFetch<AssignResponseOk | ErrorResponse>(baseUrl, secret, "assign", "POST", payload);
}

// ── billing ─────────────────────────────────────────────────────────────

export interface BillingPayload {
  eventId: string;
  customerRef: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "READ_ONLY" | "CANCELED";
  plan?: "FREE" | "STARTER" | "PRO" | "BUSINESS" | null;
  quota?: number | null;
  trialEndsAt?: string | null;
  graceUntil?: string | null;
  portalUrl?: string;
}

export interface BillingResponseOk {
  ok: true;
  applied: boolean;
  status: string;
  plan?: string;
  quota?: number;
  trialEndsAt?: string | null;
  graceUntil?: string | null;
}

export function reportBilling(baseUrl: string, secret: string, payload: BillingPayload) {
  return signedFetch<BillingResponseOk | ErrorResponse>(baseUrl, secret, "billing", "POST", payload);
}

// ── status ──────────────────────────────────────────────────────────────

export interface StatusResponse {
  ok: true;
  assigned: boolean;
  customerRef?: string;
  companyName?: string;
  status?: string;
  plan?: string | null;
  quota?: number | null;
  usage?: {
    month: string;
    deliveryNotes: number;
    previousMonth: { month: string; deliveryNotes: number };
  };
  lastActivityAt?: string | null;
  trialEndsAt?: string | null;
  graceUntil?: string | null;
  writable?: boolean;
  seats?: { office: number; driver: number; total: number } | null;
  version?: string;
  domain: string | null;
  domainReady?: boolean;
  invited?: boolean;
  domainError?: string | null;
}

export function readStatus(baseUrl: string, secret: string) {
  return signedFetch<StatusResponse>(baseUrl, secret, "status", "GET");
}

// ── release ─────────────────────────────────────────────────────────────

export interface ReleasePayload {
  eventId: string;
  customerRef: string;
  reason: "INACTIVE" | "CANCELED";
}

export interface ReleaseResponseOk {
  ok: true;
  backupId: string;
  deliveryNotes: number;
  files: number;
}

export function releaseInstance(baseUrl: string, secret: string, payload: ReleasePayload) {
  return signedFetch<ReleaseResponseOk | ErrorResponse>(baseUrl, secret, "release", "POST", payload);
}

// ── restore ─────────────────────────────────────────────────────────────

export interface RestorePayload {
  eventId: string;
  backupId: string;
  customer: AssignPayload["customer"];
  billing: Omit<AssignPayload["billing"], "quota"> & { quota?: number };
}

export interface RestoreResponseOk {
  ok: true;
  assigned: true;
  invitedUsers: number;
  restored: Record<string, unknown>;
  warnings: string[];
  domain: string;
  domainReady: boolean;
}

export function restoreInstance(baseUrl: string, secret: string, payload: RestorePayload) {
  return signedFetch<RestoreResponseOk | ErrorResponse>(baseUrl, secret, "restore", "POST", payload);
}
