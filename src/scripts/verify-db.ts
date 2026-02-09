import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import postgres from "postgres";

async function verify() {
  const sql = postgres(process.env.DATABASE_URL!, {
    ssl: "require",
    prepare: false,
  });

  const rawCount = await sql`SELECT COUNT(*) as count FROM raw_meetings`;
  console.log("raw_meetings:", rawCount[0].count);

  const objCount = await sql`SELECT COUNT(*) as count FROM objections`;
  console.log("objections:", objCount[0].count);

  const techCount = await sql`SELECT COUNT(*) as count FROM technologies`;
  console.log("technologies:", techCount[0].count);

  console.log("\n--- Latest 5 raw_meetings ---");
  const samples = await sql`
    SELECT fireflies_id, title, date, duration
    FROM raw_meetings
    ORDER BY date DESC NULLS LAST
    LIMIT 5
  `;
  for (const r of samples) {
    const d = r.date ? new Date(r.date).toISOString().slice(0, 10) : "no date";
    console.log(`  ${d} | ${r.duration}min | ${r.title}`);
  }

  console.log("\n--- Objection types ---");
  const objs = await sql`SELECT type_key FROM objections ORDER BY type_key`;
  console.log("  " + objs.map((o) => o.type_key).join(", "));

  console.log("\n--- Technologies ---");
  const techs = await sql`SELECT name, category FROM technologies ORDER BY category, name`;
  for (const t of techs) {
    console.log(`  [${t.category}] ${t.name}`);
  }

  await sql.end();
}

verify().catch(console.error);
