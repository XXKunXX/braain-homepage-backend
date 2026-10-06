export const metadata = {
  title: "braain",
  description: "Homepage-Anbindung Braain",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#fbfaf7" }}>
        {children}
      </body>
    </html>
  );
}
