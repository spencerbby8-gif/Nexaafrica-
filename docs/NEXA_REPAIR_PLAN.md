# Production intelligence repair plan — 14 October 2026

Baseline: live audit at commit 53d913676f885eb18ee16b3fe0f1217d99cc834e.
Authorized: non-destructive schema/security changes, code changes and deployment; existing providers only; pilot at most 20 jobs and 100 model requests. No new paid subscription. Track requests before calls, including retries and second opinions.

## Acceptance contract
- Separate company identity/legitimacy, specific-job authenticity, and applicant eligibility.
- A real model call is not proof that a conclusion is correct.
- Every affirmative research claim must link retained evidence, retrieval time, source identity, and the responsible provider/model/run.
- Company narrative must be AI-written from a documented investigation, not marketing copy relabelled as intelligence. Historical reputation requires dated independent evidence. Lack of negative findings is not a clean-reputation guarantee.
- Unknown, blocked, contradicted, rejected, expired, and inactive states must remain explicit throughout storage and presentation.
- Public views, search, matching, and structured data must use the same eligibility contract.
- A release is complete only after tests, deployment identity verification, and production checks. Record limitations rather than claim success without evidence.

## Release stages
1. Privacy/security boundary and CV metadata schema. Regression tests; preserve all existing rows.
2. Eligibility, visibility, source identity/freshness, search pagination and filter continuity. Use actual audited job fixtures; prevent a repeated source refresh from undoing rejection.
3. Queue outcomes, atomic claims/retries, bounded re-verification, deduplicated provider accounting and immutable evidence provenance. Remove unsupported second-opinion claims.
4. Company investigations: authoritative identity discovery, explicit job/employer linkage, bounded public-source research, dated independent reputation evidence, model-authored cited review, uncertainty and conflict reporting. Never guess domains or infer legitimacy from a logo/ATS alone.
5. At most 20-job/100-model-request production pilot. Trace source -> admission -> evidence -> inference -> persisted claims -> public output; verify all claims against retained sources. Publish successes and failures separately.

## Executed releases
- Release 1: PR #57 merged as `5b86cb7cbe0586f0e26a8ffae65172bacaf5515d`; production deployment `dpl_FPXCTgr4pY8rG64cUv2oqXmCBTdT` READY. Migration `20261014000100` committed and ledger-recorded. Live shared profile renders without raw-CV/storage-path fields. Eight anonymous/authenticated internal-read checks denied. All three CV metadata columns query successfully; jobs/profiles/queue/metadata row counts preserved. Admin authorization is fail-closed; a permitted admin session has not yet been exercised.
- Release 2: PR #58 deployed as `dfdca416300b01cd5a1fac895bdbe14907a72e5b` (deployment `dpl_6wnyh6AQ5ZPXAByxxEomTinGr7K9`), 129 tests/typecheck/build passed. Production API/home/jobs return 200; invalid cursor returns 400; distinct continuation verified. Only two existing roles pass the public policy, and none meets the stronger verified-evidence filter. This is an inventory repair requirement, not a healthy-inventory claim. Role-specific hiring evidence, restriction precedence, a shared public visibility contract, full filter continuity, timestamp-plus-ID pagination, collision-resistant WWR IDs, and Greenhouse first-publication mapping.
- Pilot usage: **0 jobs / 0 model requests**. Company investigations and queue/provenance repair remain incomplete.

- Release 3 in progress: per-request UUIDs and hard pilot request reservations; atomic cooldown-aware queue maintenance; failed re-verification preserves existing AI but retries instead of reporting completion; successful replacements archive old/new values and clear stale errors/retry dates. Ungrounded second-opinion overwrite path disabled. Stored feed text no longer invents a live HTTP 200 or “verified ATS” observation.
