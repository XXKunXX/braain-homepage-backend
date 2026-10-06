export default function Home() {
  return (
    <main style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
      <h1>braain – Homepage-Anbindung</h1>
      <p>
        Dieses Projekt ist das Backend für die Registrierung neuer
        braain-Kunden (Instanz-Zuteilung, Stripe-Abrechnung). Das
        Registrierungsformular liegt unter{" "}
        <a href="/registrieren">/registrieren</a>.
      </p>
    </main>
  );
}
