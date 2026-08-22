# Multi-Agent Incident Triage System

A simulated infrastructure-incident triage pipeline where four specialized AI agents
diagnose, decide on, and (with human approval for high-risk actions) resolve incidents —
coordinated through Redis Streams, persisted in Postgres, and observable through a
live WebSocket dashboard.

**This is a demonstration system.** Incidents and deployments are synthetically
generated; no real infrastructure is monitored or modified.

## Architecture

\`\`\`mermaid
flowchart TD
    A[Synthetic Incident Generator] -->|seeds| DB[(Postgres)]
    DB -->|enqueue| S1[incidents:new]
    S1 --> LA[Log-Analyzer Worker]
    LA -->|publish| S2[incidents:log-analyzed]
    S2 --> DG[Diagnosis Worker]
    DG -->|publish| S3[incidents:diagnosed]
    S3 --> AC[Action Worker]
    AC -->|publish| S4[incidents:action-decided]
    S4 --> CM[Communicator Worker]

    LA & DG & AC & CM -->|audit log + broadcast| DB
    DB -->|pub/sub bridge| WS[WebSocket Server]
    WS --> DASH[Live Dashboard]

    AC -->|high-risk?| APPROVAL[Human Approval\nCLI / HTTP endpoint]
    APPROVAL -->|approve/reject| DB
\`\`\`

## Why This Architecture

- **Redis Streams for agent-to-agent handoff** (not direct function calls): each agent
  is an independent consumer on its own stream. If one agent is slow, it doesn't block
  the others — and if a worker crashes mid-message, the message stays in the consumer
  group's pending list for recovery instead of being silently lost.
- **Redis Pub/Sub for the dashboard** (separate from Streams): Streams are for reliable,
  ordered work queues; Pub/Sub is for ephemeral fan-out to whoever's listening right now.
  Using Streams for both would mean the dashboard replaying stale history on every
  reconnect; using Pub/Sub for agent handoff would mean losing messages if a worker
  isn't currently running. Different guarantees, different tool.
- **Each worker owns a dedicated Redis connection.** A blocking `XREADGROUP` in flight
  queues up every other command sent on the same connection until it resolves — this
  was found through testing, not assumed, and initially caused acknowledged messages to
  appear lost when workers shared a connection.
- **Conditional updates for human approval**, not read-then-write: `resumeIncident`
  only transitions an incident that is *still* `PENDING_APPROVAL`. Verified against a
  real Postgres instance by firing simultaneous approve/reject calls at the same
  incident — exactly one ever wins, every time.
- **Ground truth baked into the schema** (`expectedAction`, `expectedRequiresHuman`,
  `scenarioType` on `Incident`), invisible to the agents at runtime, used only by the
  evaluation harness. This is what makes the accuracy numbers below real rather than
  self-reported.

## Evaluation Results

See [EVAL_RESULTS.md](./EVAL_RESULTS.md) for the latest run. Regenerate with:

\`\`\`bash
bun run enqueue-all && bun run wait-batch && bun run eval
\`\`\`

The evaluation-driven debugging process itself is part of the story here: the first
full run scored ~40% action accuracy with two systematic biases — the Diagnosis agent
over-attributing incidents to nearby-but-unrelated deployments, and the Action agent
defaulting to `escalateToHuman` under any uncertainty rather than correctly choosing
`monitor` when a diagnosis showed no real ongoing issue. Both were traced to
underspecified prompts, not model limitations, and fixed by making the decision
criteria explicit rather than implicit.

## Local Setup

\`\`\`bash
cd backend
bun install
cp .env.example .env        # add your GEMINI_API_KEY
docker compose up -d
bunx prisma migrate dev
bun run seed:all

# separate terminals:
bun run workers:start
bun run dashboard-server

cd ../frontend
bun install
bun run dev
\`\`\`

## Known Limitations

- The evaluation harness checks the *action name* and *human-approval flag* against
  ground truth, but not whether a `deploy_caused` incident correlated to the *specific
  correct* deployment — that would need a persisted ground-truth deployment ID, which
  isn't in the current schema.
- `restartService` vs `scaleReplicas` for resource-exhaustion incidents are sometimes
  treated as a strict mismatch by the evaluator even though both are safe, low-risk
  choices in practice — the eval logic doesn't currently model "acceptable alternative
  actions", only exact matches.
- Dead-lettered incidents (max retries exceeded) currently require manual inspection
  via `redis-cli XPENDING` rather than being surfaced on the dashboard.
- No automated test suite beyond the manually-run verification scripts used during
  development — the pure logic (scenario generation, JSON parsing, risk classification,
  evaluation scoring) was unit-tested during the build process, but nothing runs in CI.

## Stack

TypeScript, Bun, PostgreSQL, Prisma, Redis (Streams + Pub/Sub), Next.js, Gemini API.