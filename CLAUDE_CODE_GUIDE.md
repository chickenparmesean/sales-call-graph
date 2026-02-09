# Sales Call Intelligence Graph — Claude Code Guide

**Purpose:** Quick-reference for Claude Code sessions. Contains architecture decisions, coding conventions, common pitfalls, and the database schema — everything needed to resume work without re-reading the full bootstrap prompt.

---

## Quick Start

```bash
cd C:\Users\tyler\claude-build-workflow
claude --dangerously-skip-permissions
```

Standard preamble for any Claude Code session:
```
Override default workflow for existing project.
Project root: C:\Users\tyler\OneDrive\Documents\sales-call-graph
Read the current codebase first.
Task: [describe what you want]
```

---

## Architecture at a Glance

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Fireflies.ai    │────▶│  Raw Ingest   │────▶│  Claude API          │
│  GraphQL API     │     │  raw_meetings │     │  Classify + Extract  │
└──────────────────┘     └──────────────┘     └──────────┬───────────┘
                                                         │
                              ┌───────────────────────────▼──────────┐
                              │        Supabase Postgres             │
                              │  ┌─────────────┐  ┌───────────────┐  │
                              │  │ Relational   │  │ pgvector      │  │
                              │  │ Tables (16)  │  │ Embeddings    │  │
                              │  └──────┬──────┘  └───────┬───────┘  │
                              └─────────┼─────────────────┼──────────┘
                                        │                 │
                              ┌─────────▼─────────────────▼──────────┐
                              │          Next.js 14 App              │
                              │  ┌────────────┐  ┌────────────────┐  │
                              │  │ Cytoscape   │  │ Search / List  │  │
                              │  │ Graph       │  │ UI + Filters   │  │
                              │  └────────────┘  └────────────────┘  │
                              └──────────────────────────────────────┘
```

| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 14 App Router + TypeScript + Tailwind | Single `src/app/` directory |
| ORM | Drizzle ORM | `src/db/schema.ts` + `src/db/index.ts` |
| Database | Supabase Postgres | Relational + pgvector, all in one DB |
| Graph rendering | Cytoscape.js | Client-side, force-directed layout |
| LLM | Claude API | Haiku = bulk processing, Sonnet = quality-sensitive |
| Transcripts | Fireflies.ai GraphQL API | Bearer token auth |
| Auth | Supabase Auth | Email/password |
| Deploy | Vercel | |

**Key decision: NO separate graph DB or vector DB.** Everything lives in Supabase Postgres.

---

## Directory Structure

```
sales-call-graph/
├── .env.local              # Credentials (never commit)
├── drizzle.config.ts       # Drizzle ORM config
├── next.config.ts          # Keep minimal, no experimental flags
├── package.json
├── tsconfig.json            # paths: @/* → ./src/*
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Main dashboard
│   │   ├── layout.tsx
│   │   ├── calls/[id]/page.tsx      # Call detail
│   │   ├── team/page.tsx            # Team analytics
│   │   └── api/
│   │       ├── calls/route.ts       # GET calls with filters
│   │       ├── calls/[id]/route.ts  # GET single call
│   │       └── search/route.ts      # Semantic search (pgvector)
│   ├── components/
│   │   ├── CallList.tsx
│   │   ├── SearchBar.tsx
│   │   ├── Filters.tsx
│   │   ├── Graph.tsx                # Cytoscape.js wrapper
│   │   └── Sidebar.tsx              # Node detail panel
│   ├── db/
│   │   ├── schema.ts                # All Drizzle table definitions
│   │   └── index.ts                 # DB connection
│   ├── lib/
│   │   ├── classifier.ts            # Call classification logic
│   │   ├── extractor.ts             # Claude API extraction
│   │   ├── embeddings.ts            # pgvector embedding generation
│   │   └── graph-builder.ts         # Relational → Cytoscape elements
│   ├── types/
│   │   └── index.ts
│   └── scripts/
│       ├── pull-fireflies.ts        # Ingest from Fireflies API
│       ├── process-calls.ts         # Classify + extract pipeline
│       ├── generate-embeddings.ts   # Build pgvector embeddings
│       └── debug-db.ts              # Inspect DB state
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Fireflies
FIREFLIES_API_KEY=...

# Config
SHERLOCK_EMAIL_DOMAIN=sherlock.xyz
EXCLUDED_EMAILS=dan@hightide-advisors.com,baburovmn@gmail.com
```

---

## Database Schema (All 16 Tables)

### Core Tables

**raw_meetings** — Raw Fireflies data
- `id` (uuid PK), `fireflies_id` (varchar unique), `title`, `date` (timestamp), `duration` (integer), `raw_json` (jsonb), `classification` (varchar), `processed_at` (timestamp nullable)

**calls** — Extracted sales call data
- `id` (uuid PK), `raw_meeting_id` (FK → raw_meetings), `call_type` (varchar: discovery|pitch|follow_up|closing|check_in), `offering_pitched` (varchar: audit|retainer|lifecycle|none), `company_id` (FK → companies), `call_outcome` (varchar), `deal_size` (varchar nullable), `call_quality_score` (integer 1-10), `quality_rationale` (text), `transcript_text` (text), `summary_text` (text), `fireflies_url` (varchar), `date` (timestamp), `duration` (integer)

**companies** — Prospect companies
- `id` (uuid PK), `name` (varchar unique), `sector` (varchar), `first_seen_date` (timestamp)

**team_members** — Sherlock team
- `id` (uuid PK), `name` (varchar), `email` (varchar unique)

**prospect_contacts** — People on calls
- `id` (uuid PK), `name` (varchar), `role` (varchar), `company_id` (FK → companies)

**objections** — Canonical types (seeded)
- `id` (uuid PK), `type_key` (varchar unique), `display_name` (varchar), `description` (text)

**technologies** — Tech stack items (seeded)
- `id` (uuid PK), `name` (varchar unique), `category` (varchar)

### Join Tables

**call_objections** — `id`, `call_id` (FK), `objection_id` (FK), `quote` (text), `context` (text)
**call_technologies** — `id`, `call_id` (FK), `technology_id` (FK)
**call_team_members** — `id`, `call_id` (FK), `team_member_id` (FK)
**call_prospect_contacts** — `id`, `call_id` (FK), `prospect_contact_id` (FK)

### Detail Tables

**call_follow_ups** — `id`, `call_id` (FK), `action_text` (text), `assigned_to` (varchar)
**prospect_questions** — `id`, `call_id` (FK), `question_text` (text)
**key_quotes** — `id`, `call_id` (FK), `speaker` (varchar), `quote_text` (text), `context` (text)
**counter_responses** — `id`, `objection_id` (FK), `call_id` (FK), `response_text` (text), `outcome` (varchar)

### Vector Table

**call_embeddings** — `id`, `call_id` (FK), `chunk_index` (integer), `content_text` (text), `embedding` (vector(1536))

### Seed Data

**Objections:** budget_timing, need_internal_buyin, already_have_auditor, scope_concerns, timeline_too_long, not_ready_yet, comparing_competitors, other

**Technologies:** Solidity, Vyper, Rust, Move, Cairo, Foundry, Hardhat, Truffle, Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, Solana, BSC

---

## Graph Node Colors

| Node Type | Color | Hex |
|-----------|-------|-----|
| Call | Blue | #5b8cff |
| Company | Purple | #b07aff |
| Objection | Orange | #ff8a3d |
| Technology | Green | #00e5a0 |
| Team Member | Teal | #00bcd4 |
| Offering | Yellow | #ffd54f |

---

## Fireflies API Reference

**Endpoint:** `https://api.fireflies.ai/graphql`
**Auth:** `Authorization: Bearer ${FIREFLIES_API_KEY}`

**Pull query:**
```graphql
query {
  transcripts(limit: 50) {
    id title date dateString duration
    transcript_url audio_url video_url
    host_email organizer_email
    participants fireflies_users
    speakers { id name }
    meeting_attendees { displayName email name }
    sentences { index speaker_name speaker_id text start_time end_time }
    summary {
      keywords action_items outline overview
      shorthand_bullet gist bullet_gist
      short_summary short_overview
      meeting_type topics_discussed
    }
  }
}
```

**Filters to apply in code (not API-level):**
1. At least one `@sherlock.xyz` participant
2. At least one external (non-sherlock.xyz) participant
3. Exclude emails from `EXCLUDED_EMAILS` env var

---

## Call Classification Rules

| Classification | Criteria | Processing |
|---------------|----------|-----------|
| `sales_call` | Discusses audits/retainers/lifecycle, pricing, scope, timelines | Full LLM extraction |
| `partner_call` | Existing partners, vendors, conferences | Store + basic metadata |
| `internal` | All @sherlock.xyz participants | Skip |
| `other` | Recruiting, legal, admin | Store metadata only |

Use Fireflies summary fields first. Ambiguous → Claude Haiku on first 500 words.

---

## Coding Conventions

- `@/` path alias → `./src/*` in tsconfig.json
- All source in `src/`
- snake_case for DB table/column names
- varchar for all external IDs (never integer)
- Batch DB writes: 500 records per batch
- Use `onConflictDoUpdate()` for upserts
- `next.config.ts` — keep minimal, no experimental flags
- Only ONE `app/` directory: `src/app/` (never project root)
- pgvector similarity: cosine distance operator `<=>`
- Claude API rate limiting: 1-2 second delay between calls

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| tsconfig paths wrong | `@/*` → `["./src/*"]` NOT `["./*"]` |
| Stray `package-lock.json` in parent dir | Delete it; only one at project root |
| `app/` at project root | Delete it; only `src/app/` |
| DB queries fail silently | Test queries in isolation before API routes |
| Fireflies pagination | Handle cursor-based pagination for large result sets |
| Claude API rate limits | 1-2s delay between calls |
| pgvector wrong operator | Use `<=>` (cosine), not `<->` (L2) |
| Embedding dimension mismatch | vector(1536) for OpenAI-compatible; check actual model output |

---

## Useful Debug Commands

```bash
# Check DB state
npx tsx src/scripts/debug-db.ts

# Re-pull Fireflies data
npx tsx src/scripts/pull-fireflies.ts

# Re-process calls through extraction
npx tsx src/scripts/process-calls.ts

# Regenerate embeddings
npx tsx src/scripts/generate-embeddings.ts

# Start dev server
npm run dev
```

---

## Resuming After a Break

When picking up work on this project:

1. `cd C:\Users\tyler\OneDrive\Documents\sales-call-graph`
2. Check `git log --oneline -10` to see which phases are complete
3. Run `npx tsx src/scripts/debug-db.ts` to see current DB state
4. Check the PROJECT_PLAN.md for the current phase status
5. Launch Claude Code with the standard preamble + specific task
