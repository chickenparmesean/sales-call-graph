import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { rawMeetings } from "../db/schema";

const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  ssl: "require",
});
const db = drizzle(client);

const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const FIREFLIES_API_KEY = process.env.FIREFLIES_API_KEY!;
const SHERLOCK_DOMAIN = process.env.SHERLOCK_EMAIL_DOMAIN || "sherlock.xyz";
const EXCLUDED_EMAILS = (process.env.EXCLUDED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const TRANSCRIPTS_QUERY = `
  query PullTranscripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      dateString
      duration
      transcript_url
      audio_url
      video_url
      host_email
      organizer_email
      participants
      fireflies_users
      meeting_attendees {
        displayName
        email
        name
      }
      sentences {
        index
        speaker_name
        speaker_id
        text
        start_time
        end_time
      }
      summary {
        keywords
        action_items
        outline
        overview
        shorthand_bullet
        gist
        bullet_gist
        short_summary
        short_overview
        meeting_type
        topics_discussed
      }
    }
  }
`;

interface FirefliesTranscript {
  id: string;
  title: string;
  date: number; // Unix timestamp in ms
  dateString: string;
  duration: number;
  transcript_url: string;
  audio_url: string;
  video_url: string;
  host_email: string;
  organizer_email: string;
  participants: string[];
  fireflies_users: string[];
  meeting_attendees: { displayName: string; email: string; name: string }[];
  sentences: {
    index: number;
    speaker_name: string;
    speaker_id: number;
    text: string;
    start_time: number;
    end_time: number;
  }[];
  summary: {
    keywords: string;
    action_items: string;
    outline: string;
    overview: string;
    shorthand_bullet: string;
    gist: string;
    bullet_gist: string;
    short_summary: string;
    short_overview: string;
    meeting_type: string;
    topics_discussed: string;
  };
}

function getEmails(transcript: FirefliesTranscript): string[] {
  const emails: string[] = [];
  if (transcript.host_email) emails.push(transcript.host_email.toLowerCase());
  if (transcript.organizer_email)
    emails.push(transcript.organizer_email.toLowerCase());
  if (transcript.participants) {
    for (const p of transcript.participants) {
      if (p && p.includes("@")) emails.push(p.toLowerCase());
    }
  }
  if (transcript.meeting_attendees) {
    for (const a of transcript.meeting_attendees) {
      if (a.email) emails.push(a.email.toLowerCase());
    }
  }
  return Array.from(new Set(emails));
}

function hasSherlock(emails: string[]): boolean {
  return emails.some((e) => e.endsWith(`@${SHERLOCK_DOMAIN}`));
}

function hasExternal(emails: string[]): boolean {
  return emails.some(
    (e) => !e.endsWith(`@${SHERLOCK_DOMAIN}`) && !EXCLUDED_EMAILS.includes(e)
  );
}

function hasExcludedOnly(emails: string[]): boolean {
  const nonSherlock = emails.filter(
    (e) => !e.endsWith(`@${SHERLOCK_DOMAIN}`)
  );
  return (
    nonSherlock.length > 0 &&
    nonSherlock.every((e) => EXCLUDED_EMAILS.includes(e))
  );
}

async function fetchTranscripts(
  limit: number,
  skip: number
): Promise<FirefliesTranscript[]> {
  const response = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({
      query: TRANSCRIPTS_QUERY,
      variables: { limit, skip },
    }),
  });

  if (!response.ok) {
    throw new Error(`Fireflies API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    console.warn(`  GraphQL warnings: ${data.errors.length} error(s)`);
    for (const err of data.errors) {
      console.warn(`    - ${err.message} (path: ${err.path?.join(".")})`);
    }
  }

  return data.data?.transcripts || [];
}

async function main() {
  console.log("=== Fireflies Transcript Pull ===\n");
  console.log(`Sherlock domain: @${SHERLOCK_DOMAIN}`);
  console.log(`Excluded emails: ${EXCLUDED_EMAILS.join(", ")}`);
  console.log();

  let allTranscripts: FirefliesTranscript[] = [];
  const batchSize = 50;
  let skip = 0;
  let hasMore = true;

  // Pull in batches until we have enough or run out
  while (hasMore) {
    console.log(`Fetching batch: skip=${skip}, limit=${batchSize}...`);
    const batch = await fetchTranscripts(batchSize, skip);
    console.log(`  Got ${batch.length} transcripts`);

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    allTranscripts = allTranscripts.concat(batch);
    skip += batchSize;

    // Pull up to 200 transcripts total (will filter down)
    if (allTranscripts.length >= 200) {
      hasMore = false;
    }

    // Small delay between API calls
    if (hasMore) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(`\nTotal transcripts fetched: ${allTranscripts.length}`);

  // Apply filters
  let stats = {
    total: allTranscripts.length,
    noSherlock: 0,
    noExternal: 0,
    excludedOnly: 0,
    passed: 0,
  };

  const filtered: FirefliesTranscript[] = [];

  for (const t of allTranscripts) {
    const emails = getEmails(t);

    if (!hasSherlock(emails)) {
      stats.noSherlock++;
      continue;
    }
    if (!hasExternal(emails)) {
      stats.noExternal++;
      continue;
    }
    if (hasExcludedOnly(emails)) {
      stats.excludedOnly++;
      continue;
    }

    filtered.push(t);
    stats.passed++;
  }

  console.log("\n--- Filter Results ---");
  console.log(`Total fetched: ${stats.total}`);
  console.log(`No @sherlock.xyz participant: ${stats.noSherlock}`);
  console.log(`No external participant: ${stats.noExternal}`);
  console.log(`Only excluded emails: ${stats.excludedOnly}`);
  console.log(`Passed filters: ${stats.passed}`);

  // Store to raw_meetings
  console.log(`\nStoring ${filtered.length} meetings to raw_meetings...`);

  let inserted = 0;
  let skipped = 0;

  for (const t of filtered) {
    try {
      // Store sentences separately as transcript_text to reduce jsonb size
      const { sentences, ...metadataOnly } = t as any;
      const transcriptText = sentences
        ?.map((s: any) => `${s.speaker_name}: ${s.text}`)
        .join("\n") || "";

      // Keep sentences count in metadata for reference
      const storedJson = {
        ...metadataOnly,
        sentence_count: sentences?.length || 0,
        transcript_text: transcriptText,
      };

      await db
        .insert(rawMeetings)
        .values({
          firefliesId: t.id,
          title: t.title,
          date: t.date ? new Date(t.date) : null,
          duration: t.duration ? Math.round(t.duration) : null,
          rawJson: storedJson,
        })
        .onConflictDoUpdate({
          target: rawMeetings.firefliesId,
          set: {
            title: t.title,
            date: t.date ? new Date(t.date) : null,
            duration: t.duration ? Math.round(t.duration) : null,
            rawJson: storedJson,
          },
        });
      inserted++;
    } catch (err: any) {
      const cause = err.cause?.message || err.cause?.code || "";
      console.error(
        `  Error storing ${t.id} (${t.title}): ${err.message.slice(0, 100)}${cause ? ` | cause: ${cause}` : ""}`
      );
      skipped++;
    }
  }

  console.log(`\n--- Storage Results ---`);
  console.log(`Inserted/updated: ${inserted}`);
  console.log(`Errors: ${skipped}`);

  // Verify
  const countResult = await client`SELECT COUNT(*) as count FROM raw_meetings`;
  console.log(`\nTotal raw_meetings in DB: ${countResult[0].count}`);

  await client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
