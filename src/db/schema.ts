import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  customType,
} from "drizzle-orm/pg-core";

// Custom type for pgvector
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown) {
    const str = value as string;
    return str
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

// ─── Core Tables ────────────────────────────────────────────

export const rawMeetings = pgTable("raw_meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  firefliesId: varchar("fireflies_id", { length: 255 }).unique().notNull(),
  title: varchar("title", { length: 500 }),
  date: timestamp("date"),
  duration: integer("duration"),
  rawJson: jsonb("raw_json"),
  classification: varchar("classification", { length: 50 }),
  processedAt: timestamp("processed_at"),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).unique().notNull(),
  sector: varchar("sector", { length: 100 }),
  firstSeenDate: timestamp("first_seen_date"),
});

export const teamMembers = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique().notNull(),
});

export const prospectContacts = pgTable("prospect_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }),
  companyId: uuid("company_id").references(() => companies.id),
});

export const objections = pgTable("objections", {
  id: uuid("id").defaultRandom().primaryKey(),
  typeKey: varchar("type_key", { length: 100 }).unique().notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  description: text("description"),
});

export const technologies = pgTable("technologies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).unique().notNull(),
  category: varchar("category", { length: 100 }),
});

export const calls = pgTable("calls", {
  id: uuid("id").defaultRandom().primaryKey(),
  rawMeetingId: uuid("raw_meeting_id").references(() => rawMeetings.id),
  callType: varchar("call_type", { length: 50 }),
  offeringPitched: varchar("offering_pitched", { length: 50 }),
  companyId: uuid("company_id").references(() => companies.id),
  callOutcome: varchar("call_outcome", { length: 100 }),
  dealSize: varchar("deal_size", { length: 100 }),
  callQualityScore: integer("call_quality_score"),
  qualityRationale: text("quality_rationale"),
  transcriptText: text("transcript_text"),
  summaryText: text("summary_text"),
  firefliesUrl: varchar("fireflies_url", { length: 500 }),
  date: timestamp("date"),
  duration: integer("duration"),
});

// ─── Join Tables ────────────────────────────────────────────

export const callObjections = pgTable("call_objections", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  objectionId: uuid("objection_id")
    .references(() => objections.id)
    .notNull(),
  quote: text("quote"),
  context: text("context"),
});

export const callTechnologies = pgTable("call_technologies", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  technologyId: uuid("technology_id")
    .references(() => technologies.id)
    .notNull(),
});

export const callTeamMembers = pgTable("call_team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  teamMemberId: uuid("team_member_id")
    .references(() => teamMembers.id)
    .notNull(),
});

export const callProspectContacts = pgTable("call_prospect_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  prospectContactId: uuid("prospect_contact_id")
    .references(() => prospectContacts.id)
    .notNull(),
});

// ─── Detail Tables ──────────────────────────────────────────

export const callFollowUps = pgTable("call_follow_ups", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  actionText: text("action_text").notNull(),
  assignedTo: varchar("assigned_to", { length: 255 }),
});

export const prospectQuestions = pgTable("prospect_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  questionText: text("question_text").notNull(),
});

export const keyQuotes = pgTable("key_quotes", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  speaker: varchar("speaker", { length: 255 }),
  quoteText: text("quote_text").notNull(),
  context: text("context"),
});

export const counterResponses = pgTable("counter_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectionId: uuid("objection_id")
    .references(() => objections.id)
    .notNull(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  responseText: text("response_text").notNull(),
  outcome: varchar("outcome", { length: 100 }),
});

// ─── Vector Table ───────────────────────────────────────────

export const callEmbeddings = pgTable("call_embeddings", {
  id: uuid("id").defaultRandom().primaryKey(),
  callId: uuid("call_id")
    .references(() => calls.id)
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  contentText: text("content_text").notNull(),
  embedding: vector("embedding"),
});
