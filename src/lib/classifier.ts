import Anthropic from "@anthropic-ai/sdk";

export type Classification = "sales_call" | "partner_call" | "internal" | "other";

interface RawMeetingData {
  title?: string;
  participants?: string[];
  meeting_attendees?: { displayName: string; email: string; name: string }[];
  host_email?: string;
  organizer_email?: string;
  transcript_text?: string;
  summary?: {
    meeting_type?: string;
    overview?: string;
    keywords?: string;
    short_summary?: string;
    topics_discussed?: string;
  };
}

const SHERLOCK_DOMAIN = process.env.SHERLOCK_EMAIL_DOMAIN || "sherlock.xyz";

// Sales-related keywords for rule-based classification
const SALES_KEYWORDS = [
  "audit", "security audit", "smart contract", "retainer", "lifecycle",
  "pricing", "proposal", "scope", "timeline", "engagement",
  "quote", "budget", "deal", "contract", "sow", "statement of work",
  "penetration test", "code review", "security review",
  "sherlock", "coverage", "protocol", "defi",
];

const PARTNER_KEYWORDS = [
  "partnership", "vendor", "integration", "conference", "event",
  "sponsor", "collaborate", "referral", "reseller",
];

const INTERNAL_KEYWORDS = [
  "standup", "sprint", "retro", "retrospective", "1:1", "one on one",
  "team sync", "all hands", "weekly sync", "daily standup",
];

function getAllEmails(data: RawMeetingData): string[] {
  const emails: string[] = [];
  if (data.host_email) emails.push(data.host_email.toLowerCase());
  if (data.organizer_email) emails.push(data.organizer_email.toLowerCase());
  if (data.participants) {
    for (const p of data.participants) {
      if (p && p.includes("@")) emails.push(p.toLowerCase());
    }
  }
  if (data.meeting_attendees) {
    for (const a of data.meeting_attendees) {
      if (a.email) emails.push(a.email.toLowerCase());
    }
  }
  return Array.from(new Set(emails));
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

/**
 * Rule-based classification using Fireflies summary fields.
 * Returns null if ambiguous (needs LLM fallback).
 */
function classifyByRules(data: RawMeetingData): Classification | null {
  const emails = getAllEmails(data);
  const sherlockEmails = emails.filter((e) => e.endsWith(`@${SHERLOCK_DOMAIN}`));
  const externalEmails = emails.filter((e) => !e.endsWith(`@${SHERLOCK_DOMAIN}`));

  // All sherlock participants = internal
  if (sherlockEmails.length > 0 && externalEmails.length === 0) {
    return "internal";
  }

  // Build text corpus from summary fields
  const textParts: string[] = [];
  if (data.title) textParts.push(data.title);
  if (data.summary?.meeting_type) textParts.push(data.summary.meeting_type);
  if (data.summary?.overview) textParts.push(data.summary.overview);
  if (data.summary?.keywords) textParts.push(data.summary.keywords);
  if (data.summary?.short_summary) textParts.push(data.summary.short_summary);
  if (data.summary?.topics_discussed) textParts.push(data.summary.topics_discussed);
  const corpus = textParts.join(" ");

  if (!corpus.trim()) return null; // No summary data, need LLM

  const salesScore = countKeywordMatches(corpus, SALES_KEYWORDS);
  const partnerScore = countKeywordMatches(corpus, PARTNER_KEYWORDS);
  const internalScore = countKeywordMatches(corpus, INTERNAL_KEYWORDS);

  // Clear winner
  if (salesScore >= 3 && salesScore > partnerScore && salesScore > internalScore) {
    return "sales_call";
  }
  if (partnerScore >= 2 && partnerScore > salesScore) {
    return "partner_call";
  }
  if (internalScore >= 2 && internalScore > salesScore) {
    return "internal";
  }

  // Meeting type field from Fireflies is often informative
  const meetingType = (data.summary?.meeting_type || "").toLowerCase();
  if (meetingType.includes("sales") || meetingType.includes("discovery") || meetingType.includes("pitch")) {
    return "sales_call";
  }
  if (meetingType.includes("internal") || meetingType.includes("standup") || meetingType.includes("team")) {
    return "internal";
  }

  // Low-confidence sales match (at least 1 keyword)
  if (salesScore >= 1 && externalEmails.length > 0) {
    return "sales_call";
  }

  // Ambiguous — need LLM
  return null;
}

/**
 * LLM-based classification using Claude Haiku on the first 500 words of transcript.
 */
async function classifyByLLM(
  client: Anthropic,
  data: RawMeetingData
): Promise<Classification> {
  const transcript = data.transcript_text || "";
  const first500Words = transcript.split(/\s+/).slice(0, 500).join(" ");

  const titleContext = data.title ? `Meeting title: "${data.title}"\n` : "";
  const overviewContext = data.summary?.overview
    ? `Overview: "${data.summary.overview}"\n`
    : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Classify this meeting into exactly one category. Respond with ONLY the category name, nothing else.

Categories:
- sales_call: Discusses smart contract audits, security retainers, lifecycle security, pricing, proposals, scope, or timelines with a prospect
- partner_call: Discussion with existing partners, vendors, conferences, or integrations
- internal: Internal team meeting (standup, sprint, 1:1, etc.)
- other: Recruiting, legal, admin, or anything else

${titleContext}${overviewContext}
Transcript excerpt:
${first500Words}

Category:`,
      },
    ],
  });

  const text = (response.content[0] as { type: string; text: string }).text
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, "");

  const valid: Classification[] = ["sales_call", "partner_call", "internal", "other"];
  return valid.includes(text as Classification) ? (text as Classification) : "other";
}

/**
 * Classify a raw meeting. Uses rules first, falls back to LLM for ambiguous cases.
 */
export async function classifyMeeting(
  data: RawMeetingData,
  anthropicClient: Anthropic
): Promise<Classification> {
  const ruleResult = classifyByRules(data);
  if (ruleResult !== null) {
    return ruleResult;
  }
  return classifyByLLM(anthropicClient, data);
}
