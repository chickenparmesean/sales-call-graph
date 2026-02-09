import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, isNull, sql } from "drizzle-orm";
import {
  rawMeetings,
  calls,
  companies,
  teamMembers,
  prospectContacts,
  objections,
  technologies,
  callObjections,
  callTechnologies,
  callTeamMembers,
  callProspectContacts,
  callFollowUps,
  prospectQuestions,
  keyQuotes,
  counterResponses,
} from "../db/schema";
import { classifyMeeting, type Classification } from "../lib/classifier";
import { extractSalesCall, type ExtractionResult } from "../lib/extractor";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
});
const db = drizzle(client);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SHERLOCK_DOMAIN = process.env.SHERLOCK_EMAIL_DOMAIN || "sherlock.xyz";

// Delay between Claude API calls (ms)
const API_DELAY = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Lookup/upsert helpers ──────────────────────────────────

async function getOrCreateCompany(name: string, date?: Date | null): Promise<string> {
  const normalized = name.trim();
  if (!normalized || normalized === "Unknown") {
    // Create a placeholder
    const result = await db
      .insert(companies)
      .values({ name: `Unknown-${Date.now()}`, firstSeenDate: date || new Date() })
      .returning({ id: companies.id });
    return result[0].id;
  }

  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, normalized))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await db
    .insert(companies)
    .values({ name: normalized, firstSeenDate: date || new Date() })
    .returning({ id: companies.id });
  return result[0].id;
}

async function getOrCreateTeamMember(name: string, email: string | null | undefined): Promise<string> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    // Generate a placeholder email
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

async function getOrCreateProspectContact(
  name: string,
  role: string,
  companyId: string
): Promise<string> {
  // Check by name + company (prospects may share names across companies)
  const existing = await db
    .select({ id: prospectContacts.id })
    .from(prospectContacts)
    .where(eq(prospectContacts.name, name.trim()))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await db
    .insert(prospectContacts)
    .values({
      name: name.trim(),
      role: role || null,
      companyId,
    })
    .returning({ id: prospectContacts.id });
  return result[0].id;
}

async function getObjectionId(typeKey: string): Promise<string | null> {
  const result = await db
    .select({ id: objections.id })
    .from(objections)
    .where(eq(objections.typeKey, typeKey))
    .limit(1);
  return result.length > 0 ? result[0].id : null;
}

async function getTechnologyId(name: string): Promise<string | null> {
  const result = await db
    .select({ id: technologies.id })
    .from(technologies)
    .where(eq(technologies.name, name))
    .limit(1);
  return result.length > 0 ? result[0].id : null;
}

// ─── Store extraction results ──────────────────────────────

async function storeExtraction(
  rawMeetingId: string,
  rawData: any,
  extraction: ExtractionResult
): Promise<void> {
  const meetingDate = rawData.date ? new Date(rawData.date) : null;
  const duration = rawData.duration ? Math.round(rawData.duration) : null;

  // 1. Get or create company
  const companyId = await getOrCreateCompany(extraction.company_name, meetingDate);

  // 2. Create the call record
  const callResult = await db
    .insert(calls)
    .values({
      rawMeetingId,
      callType: extraction.call_type,
      offeringPitched: extraction.offering_pitched,
      companyId,
      callOutcome: extraction.call_outcome,
      dealSize: extraction.deal_size,
      callQualityScore: extraction.call_quality_score,
      qualityRationale: extraction.quality_rationale,
      transcriptText: rawData.transcript_text || null,
      summaryText: rawData.summary?.overview || rawData.summary?.short_summary || null,
      firefliesUrl: rawData.transcript_url || null,
      date: meetingDate,
      duration,
    })
    .returning({ id: calls.id });

  const callId = callResult[0].id;

  // 3. Team members
  for (const tm of extraction.team_members) {
    try {
      const tmId = await getOrCreateTeamMember(tm.name, tm.email);
      await db.insert(callTeamMembers).values({ callId, teamMemberId: tmId });
    } catch (err) {
      console.warn(`    Warning: failed to link team member ${tm.name}: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  // 4. Prospect contacts
  for (const pc of extraction.prospect_names) {
    try {
      const pcId = await getOrCreateProspectContact(pc.name, pc.role, companyId);
      await db.insert(callProspectContacts).values({ callId, prospectContactId: pcId });
    } catch (err) {
      console.warn(`    Warning: failed to link prospect ${pc.name}: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  // 5. Technologies
  for (const tech of extraction.tech_stack) {
    try {
      const techId = await getTechnologyId(tech);
      if (techId) {
        await db.insert(callTechnologies).values({ callId, technologyId: techId });
      }
      // Skip technologies not in our seeded list
    } catch (err) {
      // Ignore duplicates
    }
  }

  // 6. Objections
  for (const obj of extraction.objections) {
    try {
      const objId = await getObjectionId(obj.type_key);
      if (objId) {
        await db.insert(callObjections).values({
          callId,
          objectionId: objId,
          quote: obj.quote || null,
          context: obj.context || null,
        });
      }
    } catch (err) {
      // Ignore duplicates
    }
  }

  // 7. Follow-up actions
  for (const fu of extraction.follow_up_actions) {
    try {
      await db.insert(callFollowUps).values({
        callId,
        actionText: fu.action_text,
        assignedTo: fu.assigned_to || null,
      });
    } catch (err) {
      // Ignore
    }
  }

  // 8. Prospect questions
  for (const q of extraction.prospect_questions) {
    try {
      if (q && q.trim()) {
        await db.insert(prospectQuestions).values({
          callId,
          questionText: q.trim(),
        });
      }
    } catch (err) {
      // Ignore
    }
  }

  // 9. Key quotes
  for (const kq of extraction.key_quotes) {
    try {
      await db.insert(keyQuotes).values({
        callId,
        speaker: kq.speaker || null,
        quoteText: kq.quote_text,
        context: kq.context || null,
      });
    } catch (err) {
      // Ignore
    }
  }

  // 10. Counter responses
  for (const cr of extraction.counter_responses) {
    try {
      const objId = await getObjectionId(cr.objection_type_key);
      if (objId) {
        await db.insert(counterResponses).values({
          objectionId: objId,
          callId,
          responseText: cr.response_text,
          outcome: cr.outcome || null,
        });
      }
    } catch (err) {
      // Ignore
    }
  }
}

// ─── Main pipeline ─────────────────────────────────────────

async function main() {
  console.log("=== Phase 2: Classification + LLM Extraction Pipeline ===\n");

  // Fetch all unprocessed raw meetings
  const unprocessed = await db
    .select()
    .from(rawMeetings)
    .where(isNull(rawMeetings.processedAt));

  console.log(`Found ${unprocessed.length} unprocessed meetings\n`);

  if (unprocessed.length === 0) {
    console.log("Nothing to process. Exiting.");
    await client.end();
    process.exit(0);
  }

  const stats = {
    total: unprocessed.length,
    sales_call: 0,
    partner_call: 0,
    internal: 0,
    other: 0,
    extracted: 0,
    extractionErrors: 0,
    classificationLLMCalls: 0,
  };

  for (let i = 0; i < unprocessed.length; i++) {
    const meeting = unprocessed[i];
    const rawData = meeting.rawJson as any;
    const title = meeting.title || rawData?.title || "Untitled";

    console.log(`[${i + 1}/${unprocessed.length}] "${title}"`);

    // Step 1: Classify
    let classification: Classification;
    try {
      classification = await classifyMeeting(rawData || {}, anthropic);
      console.log(`  Classification: ${classification}`);
    } catch (err) {
      console.error(`  Classification failed: ${(err as Error).message.slice(0, 100)}`);
      classification = "other";
    }

    stats[classification]++;

    // Update classification on raw_meeting
    await db
      .update(rawMeetings)
      .set({ classification })
      .where(eq(rawMeetings.id, meeting.id));

    // Step 2: Extract (only for sales_calls)
    if (classification === "sales_call") {
      try {
        const transcript = rawData?.transcript_text || "";
        const overview = rawData?.summary?.overview || "";

        if (!transcript || transcript.length < 50) {
          console.log("  Skipping extraction: transcript too short");
        } else {
          // Delay before Claude API call
          await sleep(API_DELAY);

          const extraction = await extractSalesCall(
            anthropic,
            transcript,
            title,
            overview
          );

          console.log(`  Extracted: ${extraction.company_name} | ${extraction.call_type} | ${extraction.offering_pitched} | Score: ${extraction.call_quality_score}`);

          await storeExtraction(meeting.id, rawData, extraction);
          stats.extracted++;
        }
      } catch (err) {
        console.error(`  Extraction error: ${(err as Error).message.slice(0, 150)}`);
        stats.extractionErrors++;
      }
    }

    // Mark as processed
    await db
      .update(rawMeetings)
      .set({ processedAt: new Date() })
      .where(eq(rawMeetings.id, meeting.id));
  }

  // Summary
  console.log("\n=== Pipeline Complete ===");
  console.log(`Total processed: ${stats.total}`);
  console.log(`  sales_call:   ${stats.sales_call}`);
  console.log(`  partner_call: ${stats.partner_call}`);
  console.log(`  internal:     ${stats.internal}`);
  console.log(`  other:        ${stats.other}`);
  console.log(`  extracted:    ${stats.extracted}`);
  console.log(`  extract errors: ${stats.extractionErrors}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
