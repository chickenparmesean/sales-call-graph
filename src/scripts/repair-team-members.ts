/**
 * Repair script: Re-extract team members from raw_meetings and link them to calls.
 * Fixes the null email bug from the initial pipeline run.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import {
  rawMeetings,
  calls,
  teamMembers,
  callTeamMembers,
} from "../db/schema";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
});
const db = drizzle(client);

const SHERLOCK_DOMAIN = process.env.SHERLOCK_EMAIL_DOMAIN || "sherlock.xyz";

async function getOrCreateTeamMember(name: string, email: string | null | undefined): Promise<string> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    // Generate a placeholder email from name
    const slug = name.trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "");
    const placeholderEmail = `${slug || "unknown"}@${SHERLOCK_DOMAIN}`;
    const existing = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.email, placeholderEmail))
      .limit(1);
    if (existing.length > 0) return existing[0].id;
    const result = await db
      .insert(teamMembers)
      .values({ name: name.trim() || "Unknown", email: placeholderEmail })
      .returning({ id: teamMembers.id });
    return result[0].id;
  }

  const existing = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.email, normalizedEmail))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await db
    .insert(teamMembers)
    .values({ name: name.trim(), email: normalizedEmail })
    .returning({ id: teamMembers.id });
  return result[0].id;
}

async function main() {
  console.log("=== Repair: Re-link Team Members ===\n");

  // Get all calls with their raw_meeting data
  const allCalls = await db
    .select({
      callId: calls.id,
      rawMeetingId: calls.rawMeetingId,
    })
    .from(calls);

  console.log(`Found ${allCalls.length} calls to process\n`);

  let linked = 0;
  let skipped = 0;

  for (const call of allCalls) {
    if (!call.rawMeetingId) continue;

    // Get the raw meeting data
    const rawMeeting = await db
      .select({ rawJson: rawMeetings.rawJson })
      .from(rawMeetings)
      .where(eq(rawMeetings.id, call.rawMeetingId))
      .limit(1);

    if (rawMeeting.length === 0) continue;

    const rawData = rawMeeting[0].rawJson as any;

    // Extract sherlock team members from attendees/participants
    const sherlockMembers: { name: string; email: string }[] = [];

    // From meeting_attendees
    if (rawData?.meeting_attendees) {
      for (const a of rawData.meeting_attendees) {
        if (a.email && a.email.toLowerCase().endsWith(`@${SHERLOCK_DOMAIN}`)) {
          sherlockMembers.push({ name: a.displayName || a.name || a.email.split("@")[0], email: a.email });
        }
      }
    }

    // From participants
    if (rawData?.participants) {
      for (const p of rawData.participants) {
        if (p && p.includes("@") && p.toLowerCase().endsWith(`@${SHERLOCK_DOMAIN}`)) {
          const existing = sherlockMembers.find(m => m.email.toLowerCase() === p.toLowerCase());
          if (!existing) {
            sherlockMembers.push({ name: p.split("@")[0], email: p });
          }
        }
      }
    }

    // From host/organizer
    if (rawData?.host_email && rawData.host_email.toLowerCase().endsWith(`@${SHERLOCK_DOMAIN}`)) {
      const existing = sherlockMembers.find(m => m.email.toLowerCase() === rawData.host_email.toLowerCase());
      if (!existing) {
        sherlockMembers.push({ name: rawData.host_email.split("@")[0], email: rawData.host_email });
      }
    }

    for (const tm of sherlockMembers) {
      try {
        const tmId = await getOrCreateTeamMember(tm.name, tm.email);

        // Check if link already exists
        const existingLink = await db
          .select({ id: callTeamMembers.id })
          .from(callTeamMembers)
          .where(sql`${callTeamMembers.callId} = ${call.callId} AND ${callTeamMembers.teamMemberId} = ${tmId}`)
          .limit(1);

        if (existingLink.length === 0) {
          await db.insert(callTeamMembers).values({ callId: call.callId, teamMemberId: tmId });
          linked++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn(`  Warning: ${tm.name} (${tm.email}): ${(err as Error).message.slice(0, 60)}`);
      }
    }
  }

  console.log(`\n=== Repair Complete ===`);
  console.log(`Linked: ${linked}`);
  console.log(`Already existed: ${skipped}`);

  // Show team member counts
  const members = await client.unsafe(
    `SELECT tm.name, tm.email, COUNT(ctm.id) as call_count
     FROM team_members tm
     LEFT JOIN call_team_members ctm ON tm.id = ctm.team_member_id
     GROUP BY tm.id, tm.name, tm.email
     ORDER BY call_count DESC`
  );
  console.log("\n--- Team Members After Repair ---");
  for (const row of members) {
    console.log(`  ${row.name} (${row.email}) — ${row.call_count} calls`);
  }

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
