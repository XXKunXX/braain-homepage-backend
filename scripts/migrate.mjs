// Führt alle .sql-Dateien unter migrations/ in alphabetischer Reihenfolge
// gegen DATABASE_URL aus. Einfach gehalten (kein Migrations-Framework),
// weil es hier vorerst nur eine Handvoll Tabellen gibt.
//
// Aufruf: npm run migrate
//
// Bewusst als reines .mjs (statt .ts über ts-node) geschrieben: der
// ts-node/esm-Loader kollidiert auf neueren Node-Versionen (22.x) mit
// Next.js' eigenem tsconfig ("module": "esnext" ohne "type": "module" in
// package.json) und wirft ERR_REQUIRE_CYCLE_MODULE. Für dieses kleine,
// typlose Skript reicht reines ESM-JavaScript, das läuft ohne Loader.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example)");
  }

  const dir = path.join(process.cwd(), "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      console.log(`→ führe ${file} aus...`);
      await pool.query(sql);
      console.log(`  ✓ ${file} fertig`);
    }
    console.log("Alle Migrationen angewendet.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
