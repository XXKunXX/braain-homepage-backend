import { Pool } from "pg";

// Ein einziger Pool pro Serverless-Instanz (Next.js/Vercel hält Module
// zwischen Aufrufen warm, solange die Funktion nicht neu kaltstartet).
let pool: Pool | undefined;

export function getDb(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example)");
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
    });
  }
  return pool;
}
