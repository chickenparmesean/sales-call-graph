import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { objections, technologies } from "../db/schema";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
});
const db = drizzle(client);

const OBJECTION_SEEDS = [
  {
    typeKey: "budget_timing",
    displayName: "Budget / Timing",
    description: "Prospect cites budget constraints or timing issues for not moving forward",
  },
  {
    typeKey: "need_internal_buyin",
    displayName: "Need Internal Buy-in",
    description: "Prospect needs approval from internal stakeholders before committing",
  },
  {
    typeKey: "already_have_auditor",
    displayName: "Already Have Auditor",
    description: "Prospect already works with another security auditor",
  },
  {
    typeKey: "scope_concerns",
    displayName: "Scope Concerns",
    description: "Prospect has concerns about the scope of work, deliverables, or coverage",
  },
  {
    typeKey: "timeline_too_long",
    displayName: "Timeline Too Long",
    description: "Prospect feels the audit timeline is too long for their needs",
  },
  {
    typeKey: "not_ready_yet",
    displayName: "Not Ready Yet",
    description: "Prospect's code or project is not at a stage where an audit makes sense",
  },
  {
    typeKey: "comparing_competitors",
    displayName: "Comparing Competitors",
    description: "Prospect is evaluating multiple audit firms before making a decision",
  },
  {
    typeKey: "other",
    displayName: "Other",
    description: "Objection that does not fit into the canonical categories",
  },
];

const TECHNOLOGY_SEEDS = [
  { name: "Solidity", category: "language" },
  { name: "Vyper", category: "language" },
  { name: "Rust", category: "language" },
  { name: "Move", category: "language" },
  { name: "Cairo", category: "language" },
  { name: "Foundry", category: "framework" },
  { name: "Hardhat", category: "framework" },
  { name: "Truffle", category: "framework" },
  { name: "Ethereum", category: "chain" },
  { name: "Arbitrum", category: "chain" },
  { name: "Optimism", category: "chain" },
  { name: "Base", category: "chain" },
  { name: "Polygon", category: "chain" },
  { name: "Avalanche", category: "chain" },
  { name: "Solana", category: "chain" },
  { name: "BSC", category: "chain" },
];

async function seed() {
  console.log("Seeding objections...");
  for (const obj of OBJECTION_SEEDS) {
    await db
      .insert(objections)
      .values(obj)
      .onConflictDoUpdate({
        target: objections.typeKey,
        set: { displayName: obj.displayName, description: obj.description },
      });
  }
  console.log(`  Seeded ${OBJECTION_SEEDS.length} objections`);

  console.log("Seeding technologies...");
  for (const tech of TECHNOLOGY_SEEDS) {
    await db
      .insert(technologies)
      .values(tech)
      .onConflictDoUpdate({
        target: technologies.name,
        set: { category: tech.category },
      });
  }
  console.log(`  Seeded ${TECHNOLOGY_SEEDS.length} technologies`);

  console.log("Done!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
