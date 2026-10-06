"use client";

import { useEffect, useRef, useState } from "react";

// Abschnitt "Wunschadresse → Ablauf auf der Homepage": alle 60 Sekunden
// abfragen, bis domainReady und invited beide true sind. Erfahrungswert
// 10–25 Minuten, Timeout nach 45 Minuten (reine Anzeige hier; die
// Eskalation ans Braain-Team macht serverseitig ein Folge-Schritt).
const POLL_INTERVAL_MS = 60_000;
const TIMEOUT_MS = 45 * 60_000;

type Poll = {
  domain: string | null;
  domainReady: boolean;
  invited: boolean;
  domainError: string | null;
};

export default function WartenPage() {
  const [ref, setRef] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("queued") === "1") {
      setQueued(true);
      return;
    }
    setRef(params.get("ref"));
  }, []);

  useEffect(() => {
    if (!ref) return;
    let active = true;

    async function tick() {
      if (!active) return;
      if (Date.now() - startedAt.current > TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/customer/${ref}/status`);
        const data = await res.json();
        if (!active) return;
        setPoll({
          domain: data.domain ?? null,
          domainReady: !!data.domainReady,
          invited: !!data.invited,
          domainError: data.domainError ?? null,
        });
        if (data.domainReady && data.invited) return; // fertig, nicht mehr pollen
      } catch {
        // Netzwerkfehler: beim nächsten Tick erneut versuchen.
      }
      setTimeout(tick, POLL_INTERVAL_MS);
    }

    tick();
    return () => {
      active = false;
    };
  }, [ref]);

  if (queued) {
    return (
      <Shell>
        <h1>Danke!</h1>
        <p>Deine Umgebung wird eingerichtet, du bekommst den Zugang per E-Mail.</p>
      </Shell>
    );
  }

  if (!ref) {
    return (
      <Shell>
        <p>Keine Registrierung gefunden.</p>
      </Shell>
    );
  }

  if (timedOut) {
    return (
      <Shell>
        <h1>Das dauert gerade länger als gewöhnlich</h1>
        <p>Wir melden uns, sobald deine Adresse eingerichtet ist.</p>
      </Shell>
    );
  }

  if (poll?.domainReady && poll?.invited) {
    return (
      <Shell>
        <h1>Fertig! 🎉</h1>
        <p>
          Deine Adresse <strong>{poll.domain}</strong> ist eingerichtet. Die
          Einladung ist per E-Mail unterwegs (Absender{" "}
          <code>invitations@{poll.domain}</code>) – schau notfalls auch im
          Spam-Ordner nach.
        </p>
        <a href={`https://${poll.domain}`}>Zu {poll.domain} →</a>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1>Deine Adresse wird eingerichtet</h1>
      <p>Das dauert in der Regel 10 bis 25 Minuten. Du bekommst eine E-Mail, sobald es fertig ist.</p>
      <p style={{ color: "#8c8a84", fontSize: 13 }}>Diese Seite aktualisiert sich automatisch.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main style={{ padding: 40, maxWidth: 480, margin: "0 auto" }}>{children}</main>;
}
