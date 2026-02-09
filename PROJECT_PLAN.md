# Sales Call Intelligence Graph — Project Plan

**Last Updated:** 2026-02-09
**Status:** Phase 2 Complete

---

## Pre-Build: Human Setup Checklist

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Create GitHub repo `sales-call-graph` (private) | ⬜ | Clone to `C:\Users\tyler\OneDrive\Documents\sales-call-graph` |
| 2 | Provision Supabase project `sales-call-graph` | ⬜ | Save URL, anon key, service role key, DB connection string |
| 3 | Enable pgvector extension in Supabase | ⬜ | Run `CREATE EXTENSION IF NOT EXISTS vector;` in SQL Editor |
| 4 | Get Claude API key | ⬜ | From console.anthropic.com, ensure credits available |
| 5 | Get Fireflies API key | ⬜ | Copy from existing Railway deployment |
| 6 | Create `.env.local` with all credentials | ⬜ | See template in bootstrap prompt |
| 7 | Verify all keys work | ⬜ | |

---

## Phase 1: Foundation + Fireflies Ingestion

**Goal:** Next.js project initialized, full DB schema deployed, 50 test calls pulled from Fireflies.
**Commit message:** `Phase 1: Foundation + Fireflies ingestion`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Init Next.js 14 with TypeScript, Tailwind, App Router | ✅ | |
| 1.2 | Install deps: drizzle-orm, postgres, @anthropic-ai/sdk, cytoscape | ✅ | |
| 1.3 | Configure `tsconfig.json` paths (`@/*` → `./src/*`) | ✅ | |
| 1.4 | Set up Drizzle ORM config pointing to Supabase | ✅ | `src/db/index.ts` + `src/db/schema.ts` |
| 1.5 | Define ALL database tables in schema | ✅ | 16 tables total |
| 1.6 | Push schema to Supabase | ✅ | `drizzle-kit push` |
| 1.7 | Seed `objections` table (8 canonical types) | ✅ | |
| 1.8 | Seed `technologies` table (16 entries) | ✅ | |
| 1.9 | Create `scripts/pull-fireflies.ts` | ✅ | GraphQL query, filters, store to `raw_meetings` |
| 1.10 | Run Fireflies pull script — 116 calls | ✅ | 116 meetings stored (exceeded initial 50 estimate) |
| 1.11 | Verify: query `raw_meetings`, spot-check data | ✅ | |
| 1.12 | Git commit | ✅ | |

**Validation gate:** `raw_meetings` table has ~50 records with valid transcript data.

---

## Phase 2: Classification + LLM Extraction Pipeline

**Goal:** All raw meetings classified; sales calls fully extracted into relational tables.
**Commit message:** `Phase 2: Classification + LLM extraction pipeline`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Create `src/lib/classifier.ts` | ✅ | Rules-based + Claude Haiku fallback |
| 2.2 | Create `src/lib/extractor.ts` | ✅ | Claude Haiku structured extraction -> JSON |
| 2.3 | Write extraction prompt | ✅ | Returns valid JSON, normalizes all fields |
| 2.4 | Create `scripts/process-calls.ts` | ✅ | Classify -> extract -> store in all tables |
| 2.5 | Handle idempotency (don't re-process) | ✅ | Track `processed_at` on `raw_meetings` |
| 2.6 | Add rate limiting (1-2s between Claude calls) | ✅ | 1.5s delay between API calls |
| 2.7 | Run on 116 calls | ✅ | 114 sales_call, 2 other, 113 extracted (1 short transcript) |
| 2.8 | Create `scripts/debug-db.ts` | ✅ | Counts, classification breakdown, sample records |
| 2.9 | Verify: spot-check via debug-db | ✅ | All tables populated correctly |
| 2.10 | Git commit | ✅ | |

**Validation gate:** ✅ All relational tables populated. 113 calls extracted across 87 companies, 149 prospects, 187 objections, 573 follow-ups, 584 questions, 475 key quotes.

---

## Phase 3: pgvector Embeddings + Semantic Search

**Goal:** All calls embedded; semantic search API returns relevant results.
**Commit message:** `Phase 3: pgvector embeddings + semantic search`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Verify pgvector extension is enabled | ⬜ | |
| 3.2 | Create `src/lib/embeddings.ts` | ⬜ | Generate embeddings for call content |
| 3.3 | Embedding strategy: combined text per call | ⬜ | Summary + objections + quotes + questions |
| 3.4 | Also embed chunked transcript segments | ⬜ | 500 token chunks, 100 token overlap |
| 3.5 | Create `call_embeddings` table (if not in Phase 1 schema) | ⬜ | vector(1536) column |
| 3.6 | Create `scripts/generate-embeddings.ts` | ⬜ | Process all extracted calls |
| 3.7 | Run embedding generation on all calls | ⬜ | |
| 3.8 | Create `src/app/api/search/route.ts` | ⬜ | Semantic search via cosine similarity (`<=>`) |
| 3.9 | Test: 5 different semantic queries | ⬜ | e.g., "bridge security concerns" |
| 3.10 | Git commit | ⬜ | |

**Validation gate:** 5 semantic queries return sensible, ranked results.

---

## Phase 4: Core UI

**Goal:** Functional web interface — call list, detail pages, search, filters.
**Commit message:** `Phase 4: Core UI — call list, detail, search, filters`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Create `src/app/page.tsx` — main dashboard | ⬜ | |
| 4.2 | Create `src/app/calls/[id]/page.tsx` — call detail | ⬜ | All extracted fields + transcript link |
| 4.3 | Create `src/components/CallList.tsx` | ⬜ | Sortable, filterable table |
| 4.4 | Create `src/components/SearchBar.tsx` | ⬜ | Semantic search input |
| 4.5 | Create `src/components/Filters.tsx` | ⬜ | Date, type, offering, outcome, team, tech |
| 4.6 | Create `src/app/api/calls/route.ts` | ⬜ | GET with filter params |
| 4.7 | Create `src/app/api/calls/[id]/route.ts` | ⬜ | GET single call |
| 4.8 | Wire search → results → detail click-through | ⬜ | |
| 4.9 | Verify: navigate UI, search, click to detail | ⬜ | |
| 4.10 | Git commit | ⬜ | |

**Validation gate:** Can browse calls, search, filter, and view full details for any call.

---

## Phase 5: Graph Visualization

**Goal:** Interactive Cytoscape.js graph with real data, click interactions, sidebar.
**Commit message:** `Phase 5: Cytoscape.js graph visualization`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Install cytoscape + @types/cytoscape | ⬜ | |
| 5.2 | Create `src/components/Graph.tsx` | ⬜ | Cytoscape.js wrapper, force-directed layout |
| 5.3 | Create `src/lib/graph-builder.ts` | ⬜ | Relational data → Cytoscape elements |
| 5.4 | Define node colors | ⬜ | Call=#5b8cff, Company=#b07aff, Objection=#ff8a3d, Tech=#00e5a0, Team=#00bcd4, Offering=#ffd54f |
| 5.5 | Create `src/components/Sidebar.tsx` | ⬜ | Selected node details |
| 5.6 | Add "Visualize" button on search results | ⬜ | Plot matches on graph |
| 5.7 | Click handlers: node → sidebar, highlight edges | ⬜ | |
| 5.8 | Verify: graph renders, clicks work, search visualizes | ⬜ | |
| 5.9 | Git commit | ⬜ | |

**Validation gate:** Graph renders with real extracted data. Clicking nodes shows correct details.

---

## Phase 6: Intelligence Features

**Goal:** Objection tracking, team analytics, company timelines.
**Commit message:** `Phase 6: Objection tracking, team analytics, company timelines`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Objection tracker (click → all calls + counter-responses) | ⬜ | Based on call outcomes |
| 6.2 | Team analytics — per-rep stats | ⬜ | Calls, outcomes, objection patterns |
| 6.3 | Company timeline — chronological deal progression | ⬜ | |
| 6.4 | Create `src/app/team/page.tsx` | ⬜ | Team dashboard |
| 6.5 | Git commit | ⬜ | |

**Validation gate:** Objection → counter-response mapping works. Team stats accurate.

---

## Phase 7: Auth, Polish, Deploy

**Goal:** Production-ready with auth, error handling, deployed to Vercel.
**Commit message:** `Phase 7: Auth, polish, deploy`

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | Add Supabase Auth (email/password) | ⬜ | |
| 7.2 | Protected routes — redirect if not authenticated | ⬜ | |
| 7.3 | Loading states, error boundaries, empty states | ⬜ | |
| 7.4 | Responsive layout | ⬜ | |
| 7.5 | Vercel deployment config | ⬜ | |
| 7.6 | Git commit | ⬜ | |

**Validation gate:** App deployed, team can log in, all features work in production.

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Fireflies API rate limits or pagination issues | Handle cursor pagination; pull in batches |
| Claude API rate limits during extraction | 1-2 second delay between calls; batch processing |
| Extraction quality varies across transcripts | Spot-check 5 calls per batch; iterate on prompt |
| pgvector embedding costs | Combined text strategy reduces embedding count vs full transcript |
| Cytoscape.js performance with many nodes | Lazy loading; filter before rendering; limit visible nodes |
