"use client";

import { useEffect, useMemo, useState } from "react";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function RegisterPage() {
  const [company, setCompany] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slug aus dem Firmennamen vorschlagen, solange der Kunde ihn noch nicht
  // selbst angefasst hat.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(company));
    }
  }, [company, slugTouched]);

  // Live-Verfügbarkeitsprüfung, debounced.
  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      return;
    }
    setSlugStatus("checking");
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/register/check-slug?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!data.valid) {
          setSlugStatus("invalid");
        } else {
          setSlugStatus(data.available ? "available" : "taken");
        }
      } catch {
        setSlugStatus("idle");
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [slug]);

  const canSubmit = useMemo(
    () => company.trim().length > 0 && /\S+@\S+\.\S+/.test(adminEmail) && slugStatus === "available",
    [company, adminEmail, slugStatus],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company, adminEmail, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "slug_taken") {
          setError("Diese Adresse ist inzwischen vergeben. Bitte eine andere wählen.");
          setSlugStatus("taken");
        } else if (data.error === "already_registered") {
          setError("Diese E-Mail-Adresse ist schon registriert.");
        } else {
          setError("Registrierung konnte nicht abgeschlossen werden. Bitte später erneut versuchen.");
        }
        return;
      }
      if (data.queued) {
        window.location.href = "/registrieren/warten?queued=1";
        return;
      }
      window.location.href = `/registrieren/warten?ref=${encodeURIComponent(data.customerRef)}`;
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28 }}>Kostenlos starten</h1>
      <p style={{ color: "#55534d" }}>30 Lieferscheine im Monat, ohne Kreditkarte.</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
        <label>
          Firma
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            maxLength={200}
            style={inputStyle}
          />
        </label>

        <label>
          E-Mail (Admin-Zugang)
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
            maxLength={200}
            style={inputStyle}
          />
        </label>

        <label>
          Wunschadresse
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              required
              maxLength={30}
              style={inputStyle}
            />
            <span>.braain.io</span>
          </div>
          <SlugHint status={slugStatus} />
        </label>

        {error && <p style={{ color: "#b4262a" }}>{error}</p>}

        <button type="submit" disabled={!canSubmit || submitting} style={buttonStyle}>
          {submitting ? "Wird eingerichtet…" : "Jetzt registrieren"}
        </button>
      </form>
    </main>
  );
}

function SlugHint({ status }: { status: SlugStatus }) {
  const map: Record<SlugStatus, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: "Wird geprüft…", color: "#8c8a84" },
    available: { text: "✓ verfügbar", color: "#2a7a3b" },
    taken: { text: "✗ vergeben", color: "#b4262a" },
    invalid: { text: "Ungültiges Format (3–30 Zeichen, a–z, 0–9, -)", color: "#b4262a" },
  };
  const hint = map[status];
  if (!hint) return null;
  return <p style={{ fontSize: 13, color: hint.color, margin: "4px 0 0" }}>{hint.text}</p>;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginTop: 4,
  border: "1px solid #d8d4cb",
  borderRadius: 8,
  fontSize: 15,
  boxSizing: "border-box",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 20px",
  background: "#17171a",
  color: "#fbfaf7",
  border: "none",
  borderRadius: 999,
  fontSize: 15,
  cursor: "pointer",
};
