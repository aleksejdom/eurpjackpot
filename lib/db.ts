import "server-only";
import { Pool } from "pg";
export type Draw = { date: string; date_de: string; main_numbers: number[]; euro_numbers: number[] };
type DBRow = { date: string; main_numbers: number[]; euro_numbers: number[] };
let pool: Pool | undefined;
let init: Promise<void> | undefined;
function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ist nicht konfiguriert");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}
async function ready() {
  if (!init) {
    init = (async () => {
      await getPool().query(`CREATE TABLE IF NOT EXISTS eurojackpot_draws (
          date DATE PRIMARY KEY,
          main_numbers INTEGER[] NOT NULL,
          euro_numbers INTEGER[] NOT NULL,
          source TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS eurojackpot_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );`);
    })().catch(error => { init = undefined; throw error; });
  }
  await init;
}
function rowToDraw(row: DBRow): Draw {
  const date = row.date;
  return {
    date, date_de: date.slice(8,10)+"."+date.slice(5,7)+"."+date.slice(0,4),
    main_numbers: row.main_numbers, euro_numbers: row.euro_numbers
  };
}
export async function getAllDraws(): Promise<Draw[]> {
  await ready();
  const result = await getPool().query<DBRow>("SELECT to_char(date, 'YYYY-MM-DD') AS date, main_numbers, euro_numbers FROM eurojackpot_draws ORDER BY date DESC");
  return result.rows.map(rowToDraw);
}
export async function getLatestDrawDate():Promise<string|null>{
 await ready();
 const result=await getPool().query<{date:string}>("SELECT to_char(max(date), 'YYYY-MM-DD') AS date FROM eurojackpot_draws");
 return result.rows[0]?.date??null;
}
export async function getMeta(key: string): Promise<string | null> {
  await ready();
  const result = await getPool().query<{value:string}>("SELECT value FROM eurojackpot_meta WHERE key = $1", [key]);
  return result.rows[0]?.value ?? null;
}
export async function saveDraws(draws: Draw[], timestamp: string, source="LOTTO Bayern / protomultix"): Promise<number> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const d of draws) {
      await client.query(
        `INSERT INTO eurojackpot_draws (date, main_numbers, euro_numbers, source)
         VALUES ($1::date, $2::integer[], $3::integer[], $4)
         ON CONFLICT (date) DO UPDATE SET
         main_numbers=EXCLUDED.main_numbers,
         euro_numbers=EXCLUDED.euro_numbers,
         source=EXCLUDED.source,
         updated_at=now()`,
        [d.date, d.main_numbers, d.euro_numbers, source]
      );
    }
    await client.query(
      `INSERT INTO eurojackpot_meta (key,value) VALUES ('last_sync',$1)
       ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [timestamp]
    );
    await client.query(
      "INSERT INTO eurojackpot_meta (key,value) VALUES ('last_source',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
      [source]
    );
    await client.query("COMMIT");
    return draws.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
