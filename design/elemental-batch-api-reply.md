# Reply to Lovelace's `batch-api-design.md`

**Status:** Prism-side response to [`Lovelace-AI/lovelace:awm/smile · moongoose/golib/walk/ekdb/batch-api-design.md`](https://github.com/Lovelace-AI/lovelace/blob/awm/smile/moongoose/golib/walk/ekdb/batch-api-design.md).
**Companion docs:** [`elemental-batch-api-request.md`](./elemental-batch-api-request.md) (what we want), [`elemental-interaction.md`](./elemental-interaction.md) (current state).

## Overall reaction — ship it

The two-layer architecture is exactly right:

- **Layer 2** = one Go method per `§6.x` endpoint (`ScanBundle`, `CikVelocityBundle`, `StockBundle`, `EntityBundle`, `RelationshipUniverse`, `AcsBundle`). 1:1 with our six request endpoints.
- **Layer 1** = generalized batch primitives on `*EntityKnowledge` (`QuadsForEntityProperties`, `TypedNeighbors{Multi}`, `LatestPerEntityProperty`, `MultiHopNeighbors`, `BucketQuadsBy{Day,Month,Quarter}`, `DisambiguateByQuadCount`, `FindexesMatching`).

Coverage flags, per-bundle errors, and the diagnostics block sitting in Layer 2 (not Layer 1) matches our §8 contract verbatim.

The build-on-top-first decision (§3) is the right call: reuse the existing per-entity quad cache, profile on a real portfolio, push time filters into the DB layer only if a specific bundle shows up hot. That preserves our §7 cache-TTL story — the per-entity cache is what makes repeat scans cheap.

## Answers to your §7 open questions

### Q1 — Edge attributes (`title`, `start_date`, `end_date`) on officer/director

We don't care where they live in your graph (on the person entity, on an intermediate "officer-role" entity, or as edge attributes). What matters is the **bundle output shape**: one record per current officer/director with all three fields populated, as defined in our §6.1 `governance.officers[]`. Whether you implement that as `TypedNeighbors` + a companion `EdgeAttributes(source, dest, pindexes) → map[Pindex]Quad`, or as `TypedNeighbors` + a second `LatestPerEntityProperty` against the neighbor set, is your call. Just keep the response shape stable.

### Q2 — "Current officer" filter

✅ Your proposal (Layer 2 fetches all, drops past `end_date`) is fine. Ship the cheap way first, instrument the row count, push the filter into the quad fetch only if the 5-year tail turns out to be heavy. Our portfolios trend towards large public companies, so this might bite — but instrumentation will tell us.

### Q3 — Pindex aliases per tenant

The alias arrays in request-doc §4 are **illustrative of what Prism falls through today**, not a contract. They're tenant-specific in our deployment (some tenants have `us_gaap:` prefixed PIDs, some don't). Alias resolution is a Lovelace concern — your `prism_schema.go` resolving aliases to Pindex lists at startup is the right model. We just need each logical key to come back populated; we don't need to see the alias machinery.

### Q4 — Citations inline

✅ Punt agreed. Keep `elemental_get_citations` on MCP. We already flagged this as Q5 in our request-doc §9 ("willing to keep on MCP if you'd rather not duplicate"). Document it as the one thing the batch API does NOT do, and we'll keep our existing citation flow.

This means we should **drop** `citations: Record<ref, …>` from the `ScanBundle` and `EntityBundle` response shapes in our request doc §6.1 / §6.4 — we'll resolve refs the same way we do today.

### Q5 — Instrument disambiguation heuristic

✅ "Highest row count on a stable price Pindex set" matches `stockProfile.ts` lines 386–431 (probes `close_price` across up to 8 equity-candidate NEIDs and picks the one with the most rows). Lock it in.

### Q6 — Result-size ceiling

500 entities, no streaming, gzip on the wire is fine for v1. 500 matches our portfolio cap.

**One caveat:** our scan UI currently consumes SSE — it streams per-entity rows as they score. Switching to a single non-streamed `ScanBundle` response means no progress bar during the request, which is a UX regression for the 30s case. Two ways forward:

- **Option A (preferred for v1):** keep your single-response design. We change the UI to "fire-one-batch-then-render", show a determinate spinner with an estimated wall-clock derived from neid count. Simpler on your side, slight UX cost on ours.
- **Option B (future):** SSE-style "one bundle per entity event" — same wire shape, just chunked. Lets us preserve the live progress UI. Probably not v1.

Either is fine; we're flexible.

## Two things we want to track

### A. `MultiHopNeighbors` is single-entity

Your §4.3 signature takes a single `nindex base.Nindex`, not a `*base.NindexSet`. So `AcsBundle` for 50 portfolio entities internally loops `MultiHopNeighbors × 50`. Still vastly better than today's per-entity MCP fan-out, **not blocking for v1**. But if ACS scoring shows up as a wall-clock contributor in your §6.5 profiling step, a future `MultiHopNeighborsMulti` (BFS from a NindexSet, with hop tracking back to the originating root) would batch that loop.

### B. Profiling-step gate

Your §6.5 commits to profiling against our "≤30s for 100 entities" target before declaring done. We'll provide a real portfolio of 50–100 NEIDs from `prism` for that step — pick one of our active fixtures or just ask for a representative sample. If the profile blows the target, that's where the punch-down decision (request-doc §3) gets made for whichever Layer 1 primitive is hot.

## Suggested edits we'll make on the request doc

These follow from the answers above:

1. **§6.1 / §6.4:** drop `citations: Record<ref, …>` from the `ScanBundle` / `EntityBundle` response shapes (Q4).
2. **§9:** mark Q4 (citations) and Q5 (instrument disambiguation) as resolved, with pointers to this reply.
3. **§9:** update Q7 (pagination) and Q8 (streaming) with the v1 stance from Q6 above.

Will land those edits separately so this reply doc stays a clean record of the conversation.
