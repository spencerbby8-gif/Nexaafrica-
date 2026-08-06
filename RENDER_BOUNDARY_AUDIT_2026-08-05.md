# Render-Boundary Audit — 2026-08-05

**Trigger (user doctrine):** the render layer must not become a second intelligence engine. Company Intelligence = canonical long-term intelligence; Evidence Intelligence = canonical evidence; render sanitizes malformed data, improves presentation, exposes uncertainty — but never recomputes business decisions. Wrong AI conclusions are fixed at the write path / verifier / corpus / backfill, never masked at render.

**Scope of audit:** every render-plane change on `arena/019fd268-nexaafrica` vs the base commit `3d2dc90` (Truth Layer v1 §1–§5, trust de-flattening §11, Evidence V1.1 §12, Evidence V1.2 §13). Assessment: mine. Each item gets a verdict and a recommendation: **1 keep · 2 move to write path · 3 move to verifier · 4 move to evidence pipeline · 5 revert.**

Preview lane only. Nothing merged, no production, no backfills.

---

## A · Crosses the boundary — render recomputes/overrides a persisted business decision

| # | Item & location | What it does | Recommendation |
|---|---|---|---|
| A1 | **`renderEligibility` arbitration plane** — `lib/geo/render-eligibility.ts` (whole module, added in V1.2); consumers: `components/job-card.tsx:128` (chip), `components/opportunity-intelligence.tsx:212,309` (panel label), `lib/evidence.ts:267` (evidence anchor) | Re-runs the geo corpus over posting text at render time and silently supersedes BOTH stored verdicts (ingest `jobs.eligibility`, JAI `job_ai_intelligence.africa_eligibility`). This is a second verifier running in the UI. It is what hid the stale mali/Oben rows without healing them. | **3 → move to verifier** (re-reading the corpus against stored rows is exactly re-verification; the `africa-fp` backfill already requeues them) **+ 5 → revert render consumers** to stored-verdict display with the P0-4 provenance classes (JAI verdict = claim; ingest fallback = "· unverified"). The verifier corpus is already shared (`lib/geo/eligibility.ts`) — the owner is the verifier, not the render. **Honest consequence:** until merge + backfill, mali/Oben-class rows display their stored (wrong) verdicts again. That is the doctrine working as intended: visible staleness, healed at the write path, never masked at render. |
| A2 | **List-membership by render-eligibility** — `app/remote-jobs/search/[intent]/page.tsx:90` (intent page admits corpus explicit/likely only), `app/remote-jobs/[country]/page.tsx:70` (hubs exclude corpus-restricted) | Render decides which jobs qualify for a page — membership is a business decision. | **5 revert** to stored-flag filtering. Membership heals at ingest/re-verify/backfill under the shared corpus. Same honest consequence as A1. |
| A3 | **Trust cap on arbitrated tier** — `lib/trust/engine.ts:232`, cap-note `components/job-detail-layout.tsx:360` | The Africa cap gates on the render-arbitrated tier instead of the stored verdict. | **5 revert** to stored-verdict gating (`ai?.africa_eligibility`). The cap stays; its input returns to the canonical verdict. |
| A4 | **Render salary authority** — `jaiSalaryDisplay` in `lib/evidence.ts:402,509` + `components/job-card.tsx:34` (+ EvidencePanel via `deriveEvidence` opts) | Render picks WHICH canonical plane wins (JAI salary vs `jobs.salary_range`). Salary authority is already a declared write-path rule (TLV1 §2 `salary_authority_applied`; backfill `salary-conflict`). Re-implementing it at render is a second owner. | **2 → move to write path** (it exists; extend `salary-conflict` backfill coverage) **+ 5 revert** the render override. Display each plane with its provenance label, as before. |
| A5 | **Confidence gating on render corroboration** — `components/opportunity-intelligence.tsx:197,304` (`africaRe.corroborated`) | Depends on A1; stored confidence is the property of the stored verdict — detaching it at render reinterprets the pair. | **5 revert** alongside A1 (show the stored verdict with its own stored confidence). |

## B · Boundary-legitimate — sanitization / presentation / exposure of uncertainty (keep)

| # | Item & location | Why it is compliant | Recommendation |
|---|---|---|---|
| B1 | **`traceableQuote`** — `lib/evidence.ts:97` + callers `214, 409`, `components/opportunity-intelligence.tsx:183` | Detects *objectively malformed* stored artifacts (markdown href fragments, mid-word slices, escaped garbage) and refuses to render them as "verbatim quotes". Produces no intelligence; drop-only, never replaces, never recomputes. Squarely "malformed / impossible to display safely". | **1 keep** (duty statement enforced: drop-only; no substitution text that implies content) |
| B2 | **`plainifyPosting` + word-aligned per-segment `extractExcerpt`** — `lib/evidence.ts:60–131` | Quote-fidelity guarantees for quotes the presentation layer itself composes (Phase 15 derive-at-render panel predates this branch). Fixes mid-URL/mid-word slices the OLD renderer produced. | **1 keep** |
| B3 | **Salary junk guards** — `components/opportunity-intelligence.tsx:90–94` (+ undisclosed/pending fallbacks), `lib/evidence.ts:412,495` (`isRealSalaryRange`) | `"USD 0 – 0 • 100%"` and `"USD0.03k"`-class k-collapses are malformed for display; rendering them as pay is unsafe presentation. Guard stays: junk → honest "not disclosed/unclear", never a fabricated number. | **1 keep** (copy note → B9) |
| B4 | **`asSkillList` at render** — `components/opportunity-intelligence.tsx` skills block + summary; `lib/ai/normalize.ts` JSON-unwrap | "Finance, Finance" and stringified-JSON "skills" are malformed stored lists; dedupe/unwrap is display sanitization, unchanged semantics. | **1 keep** |
| B5 | **Claim-class provenance (P0-4)** — `africaFitLabel` stored-tier mapping, job-card "Likely open · unverified" class | Labels WHICH canonical plane a claim came from (JAI vs ingest fallback). Zero recompute; this is the model of honest presentation and is what A1's revert returns to duty. | **1 keep** |
| B6 | **Crawler-state label map + V1.1 state vocabulary** — `lib/ai/evidence.ts:crawlerStateLabel`, `components/job-detail-layout.tsx` | Presentation mapping of stored state → human copy; blocked copy byte-identical. | **1 keep** |
| B7 | **Presentation fixes** — "ago ago" template, observability 15/15 alignment, companies single-count label, hourly period suffix, "Tagged in the feed:" label | Bug-level presentation or provenance labeling. No decision content. | **1 keep** |
| B8 | **OG route byte-restore** | No-op vs production. | **1 keep** |
| B9 | **"Salary unclear — flagged for correction" copy** — `components/opportunity-intelligence.tsx` | The guard (B3) is fine; the words "flagged for correction" assert a pipeline action render cannot guarantee exists (nothing records a flag; backfill unrun). | **1 keep guard + copy fix**: "Raw value failed quality checks — we don't display it as compensation." (Apply with the A-series revert bundle.) |

## C · Judgment calls — presented, not decided unilaterally

| # | Item & location | Assessment | Recommendation |
|---|---|---|---|
| C1 | **`correctedTrustSignals` legitimacy recompute at render** — `lib/trust/engine.ts:109–136`, consumed by `unifiedTrustScore` + trust card | Recomputes the persisted `trust_signals/trust_score` with current weights at read time. Literal reading: this is a render-time override of a persisted score. Mitigating facts: the signal-weight changes (logo +8→+3, honest copy) are already live in the WRITE path for any row reprocessed today — only pre-change rows carry stale weights; the corrected plane sums exactly to the signals displayed under it. | **2 move to write path + 5 revert the render correction.** Re-scoring on re-verify owns it going forward; old rows belong to the trust re-score backfill (extend `app/api/ai/backfill` with `kind=trust-rescore`). **Honest consequence:** plateaus (raw 100s, 59-band) return in render until merge + rescore backfill runs. If you prefer a transitional compromise: keep the render correction ONLY until the rescore backfill completes, marked with an expiry comment. I recommend the clean revert. |
| C2 | **`unifiedTrustScore` blend + dynamic adjustments** (0.4/0.6 blend; provenance +2, richness +1/+2, decay −4/−8, dead-page −10, blocked cap) — `lib/trust/engine.ts:177–235` | Pre-existing base-branch design (3d2dc90): a render-composed headline over two canonical planes, not persisted anywhere. It modifies AI-derived numbers at render, but every modifier cites a stored field and the card shows the arithmetic. | **1 keep as the declared presentation metric** (its inputs stay canonical after A3's revert). If you want a stricter reading, decay/richness/provenance deltas could move to the write path — but that changes the base architecture, not just this branch. |
| C3 | **`softCapTrust`** — `lib/trust/engine.ts:171` | Replaced the base's hard clamp with order-preserving compression INSIDE the same pre-existing cap rule. The cap decision owner is unchanged (stored verdict / evidence state); only in-band rendering differs. | **1 keep** as presentation of an existing rule. Reverting to the hard clamp is also defensible — your call; soft cap preserves evidence ordering the clamp erased. |
| C4 | **Trust-card "at ceiling — signal sum N"** — `components/trust/trust-card.tsx` | Displays the pre-clamp arithmetic of the signals listed beneath it. | **1 keep**. If C1 reverts, the displayed sum must follow the STORED signals (it will, automatically, once the render consumes stored signals). |

## D · Correct homes from the start (no action)

- V1.1 collector logic — `shouldDeferLiveFetch`, `sameContentHash`, `collectPageEvidence` dedupe/defer (`lib/ai/evidence.ts`): **evidence pipeline** (4's home). Keep.
- Browser worker `workerStateFor`, `fetching` recovery (`scripts/evidence-worker.ts`): evidence pipeline. Keep.
- TLV1 write-path fixes — salary authority, remote authority, `lib/ai/normalize.ts` persistence normalization, backfill route (unrun): **write path** (2's home). Keep.
- TLV1 shared corpus `lib/geo/eligibility.ts`: **verifier/ingest corpus** (3's home). Keep — and note A1 was wrongly *consuming it from render*; the corpus itself is correctly placed.

## Proposed execution (on your approval)

1. Revert bundle: A1–A5 (render arbitration module + 6 consumers + trust-cap input + render salary authority + confidence gates), B9 copy fix, C1 render-trust revert; extend backfill with `kind=trust-rescore` so the write path owns re-scoring old rows.
2. Re-pin fixtures to the restored semantics (suite 9's arbitration fixtures move to the verifier-domain harness; quote/junk/skills fixtures stay).
3. Gates (tsc + harness) per change; preview-verify each revert; update `TRUTH_LAYER_V1_BUILD.md` with an explicit architecture note.
4. No merge, no production, no backfills — preview lane throughout.
