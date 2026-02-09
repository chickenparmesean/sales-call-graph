import Anthropic from "@anthropic-ai/sdk";

export interface ExtractionResult {
  call_type: "discovery" | "pitch" | "follow_up" | "closing" | "check_in";
  offering_pitched: "audit" | "retainer" | "lifecycle" | "none";
  company_name: string;
  prospect_names: { name: string; role: string }[];
  team_members: { name: string; email: string }[];
  tech_stack: string[];
  call_outcome: string;
  deal_size: string | null;
  call_quality_score: number;
  quality_rationale: string;
  objections: {
    type_key: string;
    quote: string;
    context: string;
  }[];
  prospect_questions: string[];
  key_quotes: {
    speaker: string;
    quote_text: string;
    context: string;
  }[];
  follow_up_actions: {
    action_text: string;
    assigned_to: string;
  }[];
  counter_responses: {
    objection_type_key: string;
    response_text: string;
    outcome: string;
  }[];
}

const EXTRACTION_PROMPT = `You are analyzing a sales call transcript from Sherlock, a smart contract security company. Extract structured data from this transcript.

Sherlock offers:
- Smart contract security audits (one-time code reviews)
- Security retainers (ongoing security relationships)
- Lifecycle security services (architecture review through deployment)

IMPORTANT: Return ONLY valid JSON, no markdown code fences, no explanation.

Extract the following fields:

{
  "call_type": "discovery" | "pitch" | "follow_up" | "closing" | "check_in",
  "offering_pitched": "audit" | "retainer" | "lifecycle" | "none",
  "company_name": "Name of the prospect company/protocol (best guess from context)",
  "prospect_names": [{"name": "Full Name", "role": "Their role/title if mentioned"}],
  "team_members": [{"name": "Full Name", "email": "email@sherlock.xyz if identifiable"}],
  "tech_stack": ["Solidity", "Foundry", etc. - only include if specifically mentioned],
  "call_outcome": "positive" | "negative" | "neutral" | "follow_up_scheduled" | "proposal_sent" | "declined",
  "deal_size": "$X" or null if not mentioned,
  "call_quality_score": 1-10 (10 = very productive sales conversation with clear next steps),
  "quality_rationale": "Brief explanation of the score",
  "objections": [
    {
      "type_key": "budget_timing" | "need_internal_buyin" | "already_have_auditor" | "scope_concerns" | "timeline_too_long" | "not_ready_yet" | "comparing_competitors" | "other",
      "quote": "Exact or near-exact quote from prospect",
      "context": "Brief context around the objection"
    }
  ],
  "prospect_questions": ["Questions the prospect asked"],
  "key_quotes": [
    {
      "speaker": "Speaker name",
      "quote_text": "Notable quote",
      "context": "Why this quote matters"
    }
  ],
  "follow_up_actions": [
    {
      "action_text": "What needs to happen next",
      "assigned_to": "Who is responsible"
    }
  ],
  "counter_responses": [
    {
      "objection_type_key": "Same type_key as the objection being countered",
      "response_text": "How the Sherlock team member responded",
      "outcome": "effective" | "partially_effective" | "ineffective"
    }
  ]
}

Rules:
- If a field has no data, use empty array [] or null as appropriate
- For company_name, infer from context (meeting title, domain names, project names mentioned)
- For team_members, anyone with @sherlock.xyz email or clearly on the Sherlock team
- Only include technologies that are explicitly mentioned in the conversation
- call_quality_score: 1-3 = poor (off-topic, no engagement), 4-6 = average, 7-9 = good (clear progress), 10 = excellent (deal advancing)
- Keep quotes accurate — paraphrase only if exact text isn't clear
- For objection type_key, map to the canonical types. Use "other" only if none fit.`;

/**
 * Extract structured data from a sales call transcript using Claude API.
 */
export async function extractSalesCall(
  client: Anthropic,
  transcript: string,
  title: string,
  summary?: string
): Promise<ExtractionResult> {
  const contextParts: string[] = [];
  if (title) contextParts.push(`Meeting title: "${title}"`);
  if (summary) contextParts.push(`Meeting summary: "${summary}"`);
  contextParts.push(`\nTranscript:\n${transcript}`);

  const userContent = contextParts.join("\n");

  // Truncate to ~100k chars to stay within token limits
  const truncated = userContent.length > 100000
    ? userContent.slice(0, 100000) + "\n\n[Transcript truncated]"
    : userContent;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      { role: "user", content: `${EXTRACTION_PROMPT}\n\n${truncated}` },
    ],
  });

  const text = (response.content[0] as { type: string; text: string }).text.trim();

  // Strip markdown code fences if present
  const jsonStr = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonStr) as ExtractionResult;
    return normalizeResult(parsed);
  } catch (err) {
    console.error(`  JSON parse error. Raw response (first 500 chars): ${text.slice(0, 500)}`);
    throw new Error(`Failed to parse extraction result: ${(err as Error).message}`);
  }
}

function normalizeResult(raw: any): ExtractionResult {
  return {
    call_type: raw.call_type || "discovery",
    offering_pitched: raw.offering_pitched || "none",
    company_name: raw.company_name || "Unknown",
    prospect_names: Array.isArray(raw.prospect_names) ? raw.prospect_names : [],
    team_members: Array.isArray(raw.team_members) ? raw.team_members : [],
    tech_stack: Array.isArray(raw.tech_stack) ? raw.tech_stack : [],
    call_outcome: raw.call_outcome || "neutral",
    deal_size: raw.deal_size || null,
    call_quality_score: typeof raw.call_quality_score === "number"
      ? Math.min(10, Math.max(1, raw.call_quality_score))
      : 5,
    quality_rationale: raw.quality_rationale || "",
    objections: Array.isArray(raw.objections) ? raw.objections : [],
    prospect_questions: Array.isArray(raw.prospect_questions) ? raw.prospect_questions : [],
    key_quotes: Array.isArray(raw.key_quotes) ? raw.key_quotes : [],
    follow_up_actions: Array.isArray(raw.follow_up_actions) ? raw.follow_up_actions : [],
    counter_responses: Array.isArray(raw.counter_responses) ? raw.counter_responses : [],
  };
}
