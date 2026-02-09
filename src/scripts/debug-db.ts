import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
});

const TABLES = [
  "raw_meetings",
  "calls",
  "companies",
  "team_members",
  "prospect_contacts",
  "objections",
  "technologies",
  "call_objections",
  "call_technologies",
  "call_team_members",
  "call_prospect_contacts",
  "call_follow_ups",
  "prospect_questions",
  "key_quotes",
  "counter_responses",
  "call_embeddings",
];

async function main() {
  console.log("=== Database Debug Report ===\n");

  // Row counts
  console.log("--- Row Counts ---");
  for (const table of TABLES) {
    try {
      const result = await client.unsafe(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`  ${table}: ${result[0].count}`);
    } catch (err) {
      console.log(`  ${table}: ERROR - ${(err as Error).message.slice(0, 60)}`);
    }
  }

  // Classification breakdown
  console.log("\n--- Classification Breakdown ---");
  try {
    const classifications = await client.unsafe(
      `SELECT classification, COUNT(*) as count FROM raw_meetings GROUP BY classification ORDER BY count DESC`
    );
    for (const row of classifications) {
      console.log(`  ${row.classification || "null"}: ${row.count}`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  // Processed vs unprocessed
  console.log("\n--- Processing Status ---");
  try {
    const processed = await client.unsafe(
      `SELECT COUNT(*) as count FROM raw_meetings WHERE processed_at IS NOT NULL`
    );
    const unprocessed = await client.unsafe(
      `SELECT COUNT(*) as count FROM raw_meetings WHERE processed_at IS NULL`
    );
    console.log(`  Processed: ${processed[0].count}`);
    console.log(`  Unprocessed: ${unprocessed[0].count}`);
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  // Sample calls
  console.log("\n--- Sample Calls (latest 5) ---");
  try {
    const sampleCalls = await client.unsafe(
      `SELECT c.id, c.call_type, c.offering_pitched, c.call_outcome, c.call_quality_score, c.date,
              co.name as company_name
       FROM calls c
       LEFT JOIN companies co ON c.company_id = co.id
       ORDER BY c.date DESC NULLS LAST
       LIMIT 5`
    );
    for (const row of sampleCalls) {
      console.log(`  ${row.company_name || "Unknown"} | ${row.call_type} | ${row.offering_pitched} | ${row.call_outcome} | Score: ${row.call_quality_score} | ${row.date ? new Date(row.date).toISOString().split("T")[0] : "no date"}`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  // Sample objections
  console.log("\n--- Objection Counts ---");
  try {
    const objCounts = await client.unsafe(
      `SELECT o.type_key, o.display_name, COUNT(co.id) as usage_count
       FROM objections o
       LEFT JOIN call_objections co ON o.id = co.objection_id
       GROUP BY o.id, o.type_key, o.display_name
       ORDER BY usage_count DESC`
    );
    for (const row of objCounts) {
      console.log(`  ${row.type_key}: ${row.usage_count} occurrences`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  // Sample companies
  console.log("\n--- Companies (all) ---");
  try {
    const allCompanies = await client.unsafe(
      `SELECT c.name, c.sector, COUNT(ca.id) as call_count
       FROM companies c
       LEFT JOIN calls ca ON c.id = ca.company_id
       GROUP BY c.id, c.name, c.sector
       ORDER BY call_count DESC
       LIMIT 20`
    );
    for (const row of allCompanies) {
      console.log(`  ${row.name} | ${row.sector || "no sector"} | ${row.call_count} calls`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  // Team members
  console.log("\n--- Team Members ---");
  try {
    const members = await client.unsafe(
      `SELECT tm.name, tm.email, COUNT(ctm.id) as call_count
       FROM team_members tm
       LEFT JOIN call_team_members ctm ON tm.id = ctm.team_member_id
       GROUP BY tm.id, tm.name, tm.email
       ORDER BY call_count DESC`
    );
    for (const row of members) {
      console.log(`  ${row.name} (${row.email}) — ${row.call_count} calls`);
    }
  } catch (err) {
    console.log(`  Error: ${(err as Error).message.slice(0, 80)}`);
  }

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
