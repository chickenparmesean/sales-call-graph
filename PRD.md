# Sales Call Intelligence Graph — Product Requirements Document

**Project:** Sales Call Intelligence Graph
**Team:** Sherlock (Smart Contract Security)
**Status:** Planning
**Last Updated:** 2026-02-09

---

## 1. Problem Statement

Sherlock's sales team conducts dozens of prospect calls weekly across multiple team members. Critical intelligence — objections raised, technologies discussed, deal progression, competitive positioning — is trapped in individual call recordings and scattered notes. There is no centralized system to:

- Search across all sales calls semantically
- Track objection patterns and effective counter-responses
- Visualize relationships between prospects, technologies, and deal stages
- Provide team-wide visibility into pipeline intelligence

## 2. Product Overview

A web-based intelligence tool that ingests sales call transcripts from Fireflies.ai, extracts structured data via Claude API, and presents it through an interactive graph visualization and searchable interface. All Sherlock team members' calls are included.

## 3. What Sherlock Sells

| Offering | Description |
|----------|-------------|
| Smart contract security audits | One-time code review engagements |
| Security retainers | Ongoing security relationships |
| Lifecycle security services | Architecture review through deployment |

**Target customers:** Crypto/blockchain protocols and teams.

## 4. Users

- **Sales team members** — review their own calls, prep for follow-ups, learn from team patterns
- **Sales leadership** — pipeline visibility, team performance, objection trend analysis
- **All Sherlock team members** — authenticated access via Supabase Auth

## 5. Core Features

### 5.1 Transcript Ingestion
- Pull call transcripts from Fireflies.ai GraphQL API
- Filter: at least one `@sherlock.xyz` participant + at least one external participant
- Exclude configured internal-only emails (e.g., advisors, personal accounts)
- Classify calls: sales call, partner/vendor, internal, other

### 5.2 LLM-Powered Extraction
For each sales call, extract via Claude API:

**Objective fields:**
- Call type (discovery / pitch / follow_up / closing / check_in)
- Offering pitched (audit / retainer / lifecycle / none)
- Company name, prospect names + roles, Sherlock team members
- Tech stack, protocol category, call outcome, deal size
- Follow-up actions

**Subjective/semantic fields:**
- Objections (typed to canonical categories with quotes)
- Prospect questions, concerns, call quality score
- Key quotes with speaker attribution

### 5.3 Two Query Modes

| Mode | How It Works | Example |
|------|-------------|---------|
| Structured query | Filters hit relational DB, renders on graph | "All retainer pitches to DeFi protocols with budget objections" |
| Semantic search | Natural language hits pgvector embeddings, ranked results | "Calls where prospect seemed hesitant about timeline" |

### 5.4 Graph Visualization (Cytoscape.js)
- Force-directed layout with typed, color-coded nodes
- Node types: Call (blue), Company (purple), Objection (orange), Technology (green), Team Member (teal), Offering (yellow)
- Click node → sidebar shows full details
- Search results can be plotted on graph via "Visualize" button

### 5.5 Intelligence Features
- **Objection tracker:** Click objection → see all calls where it appeared + counter-responses that led to positive outcomes
- **Company timeline:** Click company → chronological deal progression across all calls
- **Team analytics:** Per-rep stats — calls, outcomes, objection handling patterns

### 5.6 Authentication
- Supabase Auth (email/password)
- All routes protected; redirect to login if unauthenticated

## 6. Graph Relationships

```
CALL → pitched → OFFERING
CALL → surfaced → OBJECTION
CALL → involved → TECHNOLOGY
CALL → had_stage → STAGE
CALL → with → COMPANY
CALL → had_outcome → OUTCOME
COMPANY → operates_in → SECTOR
OBJECTION → countered_by → RESPONSE
TECHNOLOGY → used_by → COMPANY
TEAM_MEMBER → led → CALL
```

These are modeled as relational join tables, not a graph database. Cytoscape.js builds the visual graph at query time.

## 7. UI Layout

- **Top bar:** Semantic search input (natural language)
- **Main canvas:** Force-directed Cytoscape.js graph
- **Right sidebar:** Selected node details, transcript excerpts, path info
- **Filters panel:** Date range, call type, offering, outcome, team member, tech stack, protocol category
- **Team page:** Per-rep dashboard with stats and patterns

## 8. Call Classification Logic

| Classification | Action | Indicators |
|---------------|--------|------------|
| Sales call | Full LLM extraction pipeline | Discusses audits/retainers/lifecycle, pricing, scope, timelines |
| Partner/vendor call | Store, light metadata only | Existing partners, tool vendors, conferences |
| Internal meeting | Skip entirely | All participants are @sherlock.xyz |
| Other external | Store metadata only | Recruiting, legal, admin |

Classification uses Fireflies summary fields first (meeting_type, overview, keywords). Ambiguous cases go to Claude Haiku with first 500 words.

## 9. Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Database | Supabase Postgres + Drizzle ORM |
| Vector search | pgvector extension (same Supabase DB) |
| Graph rendering | Cytoscape.js (client-side) |
| LLM extraction | Claude API (Haiku for bulk, Sonnet for quality-sensitive) |
| Transcript source | Fireflies.ai GraphQL API |
| Auth | Supabase Auth |
| Deployment | Vercel |

**No separate graph database.** Relational join tables model the graph.
**No separate vector database.** pgvector in Supabase handles embeddings.

## 10. Database Tables

| Table | Purpose |
|-------|---------|
| `raw_meetings` | Raw Fireflies data before processing |
| `calls` | Extracted sales call data |
| `companies` | Prospect companies/protocols |
| `team_members` | Sherlock team |
| `prospect_contacts` | People on calls |
| `objections` | Canonical objection types (seeded) |
| `technologies` | Tech stack items (seeded) |
| `call_objections` | Join: call ↔ objection (with quote + context) |
| `call_technologies` | Join: call ↔ technology |
| `call_team_members` | Join: call ↔ team member |
| `call_prospect_contacts` | Join: call ↔ prospect |
| `call_follow_ups` | Follow-up actions per call |
| `prospect_questions` | Questions prospects asked |
| `key_quotes` | Notable quotes with attribution |
| `counter_responses` | What worked against objections |
| `call_embeddings` | pgvector embeddings (vector(1536)) |

## 11. Canonical Objection Types (Seeded)

budget_timing, need_internal_buyin, already_have_auditor, scope_concerns, timeline_too_long, not_ready_yet, comparing_competitors, other

## 12. Canonical Technologies (Seeded)

Solidity, Vyper, Rust, Move, Cairo, Foundry, Hardhat, Truffle, Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, Solana, BSC

## 13. Success Metrics

- All 50 test calls ingested and classified correctly
- Sales calls fully extracted with all fields populated
- Semantic search returns relevant results for 5+ test queries
- Graph renders with real data, click interactions work
- Team can log in and access shared call intelligence

## 14. Out of Scope (v1)

- Real-time call processing (batch only for now)
- CRM integration (Salesforce, HubSpot)
- Automated follow-up email generation
- Call recording playback within the app
- Custom graph layout saving
