# Implementation and independent review policy

## Status

Implemented mandatory procedure for implementation handoffs, commit boundaries, Lean design review and approval receipts. [TESTING-SPEC.md](TESTING-SPEC.md) owns verification; [CLAUDE.md](../CLAUDE.md#delegated-implementation) owns tier selection and contributor triggers.

- Choose [commit boundaries](#commit-boundaries).
- Assign [implementation lanes](#delegated-implementation-protocol).
- Assess [Lean design](#lean-proof-design-and-review).
- Select [review stages](#independent-cold-review-gate).
- Complete [capsule closure](#capsule-closure-review).

## Commit boundaries

Choose one independently reviewable feature, defect repair, or material semantic checkpoint before implementation. Keep supporting proofs, modules, lanes, tests and ordinary docs together through focused and complete affected-package gates. A green helper theorem, module, or agent handoff is no separate outcome. Commit before unrelated work; time/commit quotas do not define boundaries. Apply this to root work, delegation and per-feature commits.

Before implementation or delegation in a mixed working tree, identify the intended paths/hunks, required baseline dependencies and shared-file ownership in the existing active task. Check that the intended change can build and be tested without unrelated pending work before expensive qualification. Prefer explicit path/hunk staging; use a source export only when qualification requires isolation, and keep one candidate through corrections. Do not reconstruct successive candidates or split a coherent change merely to make its history tidier. An explicitly owner-directed checkpoint may preserve unfinished work in place; record outstanding verification and review in the active plan without claiming acceptance.

Cleanup and commit preparation must remain bounded delivery steps, never independent programmes. If preparation uncovers another prerequisite, stop expanding it: identify the broken invariant, choose the smallest coherent repair and replace the next action in [PLAN.md](PLAN.md#exact-resume-point). Report the delivery impact and continue independent implementation when that repair is blocked. Reuse valid input-bound verification; rerun changed or uncertain dependencies and retain every required acceptance gate. Reviewers must justify additional isolation, splitting or reruns by a concrete correctness, ownership or evidence risk. Historical untidiness, a new commit hash or an agent handoff is insufficient.

Group helpers toward the declared claim. A new account, public contract, admission rule, proof assumption or refinement risk may require an early immutable review before dependent implementation crosses its boundary; name the claim/risk in the plan or capsule. Never rewrite reviewed targets. Include available docs and successful resource measurements in the implementation commit; put target/verdict/status in the next required closure commit. Bind the target through the pre-review packet, without a cost-only commit or binding-only commit. Any additional immutable boundary needs its exact executable guard.

Local Lean commits use focused module/consumer builds and regression tests, including relevant isolated Docker correctness/resource checks. Other affected package gates retain their current pre-commit requirements. Run complete affected-package qualification once the coherent batch is stable; it may run concurrently with independent review against that frozen target. Both must pass before accepting the checkpoint or crossing into dependent implementation. [Three-level verification](TESTING-SPEC.md#three-level-verification-policy) owns the cadence and unchanged clean-HEAD gates; local commits do not establish acceptance. Resolve findings before publication and repeat correction-affected checks against the corrected committed target when required.

Bind successful pre-commit measurements with `sourceSha256` over exact target source in the read-only snapshot. Retain digest, conditions and successful receipt; check every archived source/build input is byte-identical before committing. `measurementReceiptSha256` hashes concatenated `command.txt`, `git-head`, `output.log`, `exit-status` bytes in that order. `measuredAtCommit` is provenance, not binding. Existing rows retain measurement identity and gain source digests from originally measured Git blobs, without invented measurements.

The cost guard rejects changed source/peak under unchanged measurement identity; preserve baseline, completeness, near-cap disclosure and fixed-cgroup acceptance. Remeasure changed relevant inputs/conditions, never merely a new commit hash. Module digests cannot detect dependency drift or replace review, ancestry or tracked-file checks.

Before proof-task expansion, record guarantee, next deliverable, separating evidence and reassessment point in plan/proposal. Reassess substantial prerequisites before implementation: retain the guarantee through a smaller approach, changed representation or explicit deferral with reason/reopen condition. `proved` permits neither unlimited growth nor discarded correctness obligations.

## Delegated implementation protocol

Delegate independent work that repays handoff cost; a handful of tool calls stays with the root. Implementers run assigned tests, never independently review themselves. Concurrent paths/build outputs are disjoint; no delegated lane edits Lean or runs a Lean command. Apply [tier rules](../CLAUDE.md#delegated-implementation) and [reuse/concurrency rules](#delegation-lifecycle) and separate [reviewer continuity](#when-a-warm-review-is-valid).

The root retains shared integration points, lifecycle/status docs, commits and complete verification. Give new agents task-shaped names and reused agents explicit replacement assignments. Before work, define:

1. Owned and excluded paths.
2. The invariant algorithm: ordered identity selection, validation, state transition, and rejection rules.
3. An adversarial counterexample/predicted red observation, including identity-first duplicates for uniqueness: two definitions sharing an owning Gateway, only one otherwise valid.
4. A cross-target invariant matrix with every required fact and explicit non-requirements; no target silently strengthens the account.
5. Agent-run focused gates and integration-reserved repository-wide gates.
6. The coherent outcome/[review boundary](#commit-boundaries), shared by supporting lanes, never inferred from handbacks.
7. Session constraints and owned-path `what-binds.ts` guard, registry, and headroom results.

A LOW brief instead names the exact commands, supplied text or search scope, the deciding check and the restore condition; its handback is receipts, guard exit codes and any failure it could not settle, reported unchanged.

Edit assigned paths only; route owner-authorized commands through the root. During active lanes, stage reviewed paths explicitly, never `git add -A` or `git add .`, and never run a whole-tree working-tree command such as `git stash`, `git restore .` or `git reset --hard`: another lane's uncommitted files share the tree. Handoffs are not commit boundaries.

Lean code, proofs and every Lean command stay with the root ([Finding 78](PROCESS-ASSESSMENT-LEDGER.md#finding-78)); a delegated brief names no `.lean` path and no wrapper invocation. The root builds narrow targets first, first-builds changed kernel-decided fixtures under the measurement ceiling, and never warms with a full-library build. Exit `75` (`LEAN_BUILD_REFUSED`) stops without retry. Retain/reap yielded builds, never interrupt/replace them for yielding.

Each nontrivial implementation agent sends exactly three concise safe-boundary reports:

1. **Red reproduced** — the counterexample fails for the predicted missing mechanism.
2. **Root mechanism implemented** — the class correction is present; the invariant matrix is unchanged or its revision explicit.
3. **Focused gates green** — proportionate owned-lane gates pass, with every changed path listed.

Do not poll/interrupt long builds between boundaries unless a missed promised boundary suggests a stall. Agents never run the complete wrapper. The root inspects diffs, resolves cross-target alignment and runs complete affected-package gates. Run the repository-wide full gate exactly once at meaningful integration/RC qualification, earlier only for concrete cross-package failure, never review frequency, hours or commits. Reuse unchanged-input evidence.

A disposable reviewer worktree needs worktree-local dependency projection: install with `env CI=true pnpm install --frozen-lockfile` when needed and run JS/TS gates with `CI=true`. Share the pnpm store, never another checkout's `node_modules`, which would let review alter main dependencies.

### Delegation lifecycle

Keep one active deliverable. Sub-agents may own bounded parts of that deliverable, but do not open independent workstreams that leave unfinished code behind. Integrate, verify and commit the selected outcome before selecting another; when blocked, record and replan instead of accumulating unrelated implementation. An owner-directed checkpoint may preserve unfinished work with its remaining verification and acceptance explicitly open.

Prefer reusing a completed MEDIUM or LOW agent for related follow-ups while its assumptions remain valid. Keep the same agent through implementation, assigned testing and corrections with explicit file ownership. Confirm its prior work has stopped and replace its assignment explicitly. Use fresh context for unrelated work, changed assumptions or required independence.

Give each new agent a task-shaped name and a concise brief covering one complete bounded outcome, affected consumers and proofs, constraints, owned paths and validation. Batch related work through implementation, tests and corrections into one handback; avoid helper-sized assignments, repeated polling and idle waiting updates. Reserve cleanup within the timebox. Run focused checks during development and broader affected-consumer gates after related changes stabilize, preserving required acceptance gates. Start with one MEDIUM worker; add concurrency only for independent subtasks of the selected deliverable with disjoint file ownership/build outputs and review capacity. A LOW agent may run beside it when read-only or on disjoint paths. Sub-agents never edit Lean or run a Lean command. HIGH takes over after repeated failure; do not delegate another equivalent attempt.

HIGH checks handbacks and owns integration, [commit boundaries](REVIEW-POLICY.md#commit-boundaries) and acceptance; inspect evidence without duplicating the worker's investigation. Follow the [delegation protocol](REVIEW-POLICY.md#delegated-implementation-protocol) for limits and [independent-review rules](../CLAUDE.md#independent-cold-review); implementers cannot review their own work. At each bounded outcome, assess accepted results against rework, context/handoff, polling and validation cost, using measured usage when available; self-correct task size, reuse, concurrency and gate cadence. Failed attempts count as rework. Do not claim unmeasured token savings. Report assessments only when asked.

### CIB BPMN fixture construction

Use pinned CIB Seven BPMN Model API for ordinary probes preserving all witness facts. Helpers enforce admitted shape: Exclusive Gateway requires exactly two conditional branches and one conditionless default. Declare direct API use as a test dependency despite transitive engine resolution.

Keep literal XML for syntax, namespace spelling, declaration/reference order, omitted/defaulted attributes, parser rejection or other lexical discriminators builders could alter. Rare excluded variants may use private typed-model/DOM helpers stating the exact mutation and asserting XML shape.

Never modify pinned CIB source/fork its DSL to simplify fixtures. Necessary tracing/fault branches follow [instrumentation policy](REFERENCE-INSTRUMENTATION-POLICY.md), remain diagnostic, shadow-compare with the pristine lane and never count as oracle evidence.

## Lean proof design and review

Apply this to proof-model selection, invariants, refactoring and Lean-bearing stage reviews. Derive selected guarantees through reusable semantic laws within the declared `proved`, `checked` or `deliberately open` bound; checked lanes gain no universal-proof obligation. Elaboration checks a term's statement, not obligation closure or maintainability.

1. **Start from composition.** State quantified guarantee, admitted models, execution boundary and premises; identify safety/progress/publication/resumption facts and their establishment by Start and actual commands. Preservation may assume predecessor invariants; composition derives them from reachability. Premises cannot assume the claimed successful outcome.
2. **Reuse transition contracts.** Keep inversion and changed/unchanged-field laws below reachability/command closure. Repeated evaluator unfolding or history induction signals missing shared contracts; check stronger existing facts first, including unchanged-field laws for empty-field preservation. Preserve real operation/atomic-command/batch-prefix/accounting-history distinctions; constructor cases alone are not patching.
3. **Strengthen induction interfaces.** Singleton/batch/scheduler induction exposes actual transition provenance, preservation and applicable reservation identity. Extend it when a second consumer reconstructs execution. Use concrete consumers, never giant invariant records, speculative frameworks or file merges solely to reduce count.
4. **Match invariant strength.** Bounds prove bounded work, not conservation/progress. Progress may need exact surviving-owner conservation, cancellation disposal and justified continuation transfer. Derive enabled-step/external-wait/completed alternatives from admitted structure/execution, not per-example/sibling cases. Keep weaker laws as consequences or separate claims.
5. **Reassess growth.** Repeated repairs/substantial prerequisites require the missing shared fact, smallest correction, consumers and decisive end-to-end theorem/discriminator. Replace [the resume action](PLAN.md#exact-resume-point), bound the attempt and retain unresolved guarantees. Continue independent delivery without weaker assurance, proof diaries or helper-volume completion claims.
6. **Place each witness by cost.** Before writing a witness, assign it in the capsule's witness list to the cheapest lane that separates it: the kernel (`decide +kernel`, proof-producing `cbv`) for structural facts on small fixed data; compiled Lean through the emitters and cross-target matrix for runtime journeys and size boundaries; TypeScript; or a law over the bounding predicate. Kernel cost grows with the data and computation it evaluates and is retained for the whole module, so a kernel witness never constructs a boundary-sized value or replays an evaluator journey per conjunct. A delegation brief copies that assignment rather than requesting every witness in Lean ([Finding 78](PROCESS-ASSESSMENT-LEDGER.md#finding-78)).

Review a representative dependency chain and same-transition consumers for premature command-closure dependency, premises, induction reuse and invariant sufficiency. Distinguish semantic cases from duplicated invariant transport at exact loci. Required findings name violated contracts, unsupported guarantees or concrete architectural defects; unmeasured preferences stay advisory. Name the retained model and smallest correction. Neither module/tactic/case counts nor green Lean checks decide design quality; reviewers do, not textual guards.

## Independent cold-review gate

Material changes select/change BPMN meaning, profile/CIB relationship, checked-source/IL representation, runtime/public observation, admission, transition family, proof boundary or Temporal refinement. This governs capsules and root proposals/specifications by claims, never layer/size. Changes to none of these open no review cycle: use guards/complete applicable gate and record non-material classification/covering guards in the status owner. Milestone reflection may still require architecture review for correlated risk.

Require cold proposal review, conditional cold checkpoint and governed closure; closure is cold except [warm continuity](#when-a-warm-review-is-valid) or [single-lane combined review](#combined-checkpoint-and-closure).

Owner direction (2026-10-14), for Practical CIB7 Coverage: the review unit is a checklist family, not a slice. A family takes one proposal review covering its selected increments, implements them as one batch through registration and hosting, and then takes one checkpoint and one closure review, or one combined review when its conditions hold. Intermediate slices inside the batch are private checkpoints and open no review stage; a review already in flight for a slice may complete.

| Stage | Immutable target and timing | Isolation | Boundary |
|---|---|---|---|
| Proposal | Committed proposal with complete normative basis, scope, Temporal preflight, rules, exclusions, versioning consequences, and open question | `fork-turns-none` | Before approval and implementation |
| Semantic checkpoint | First green committed wire/schema, checked graph/IL, runtime/public-observation, admission/profile, transition/proof, scope, cancellation, or concurrency change | `fork-turns-none`, or `fork-turns-none-combined` on the fully closed Closure target | Before the next implementation lane |
| Closure | Committed implementation/documentation closure with focused/full gates, evidence matrices, epistemic closure, cost, and exact implemented/absent status complete | `fork-turns-none`, guarded `checkpoint-reviewer-warm`, or single-lane `fork-turns-none-combined` | Before proposal graduation or the next material capsule |

Independent `approved`, or `approved-with-required-edits` plus recorded green audit, establishes approval without a human step. Record proposal `Lifecycle` in `## Status`; guarded `owner-approved` denotes receipt authority. Pending/rejected/unavailable review blocks; self-review cannot approve. Active specs contain stable contracts without transient pending-review wording or copied mutable proposal state; proposal receipts/routed status own lifecycle.

### Combined checkpoint and closure

`fork-turns-none-combined` requires the first green commit to satisfy all artifact, differential, selected CIB, Temporal, replay, mutation, docs, reflection, cost and full-gate closure obligations, with no downstream lane past the checkpoint pause. One no-context same-model/same-effort reviewer covers both stages; identical target/verdict/audit appear in both rows and writes pause until both pass. Equal stage targets require this token; duplicate byte reviews add no independence. Git checks equality; contributors/reviewers attest first-green/full-closure/single-lane completeness. Multi-lane work retains early checkpoints. Same-thread audit handles bounded corrections; redesign needs new combined cold review.

### Reviewer isolation and stage focus

Outside strict historical ancestors of `b361681`, spawn a sub-agent with `fork_turns: "none"`; the author omits both model and reasoning-effort overrides. Every reviewer uses the same root model and reasoning effort, never a generic/general worker with different settings. Cold context excludes author chat, diagnosis, findings, reports, guidance or verdicts. Author threads, full-history forks, different settings and implementers fail isolation.

Cold prompts contain objective contract, exact targets, packet and concise claims/source/negative/gate checklist. Read the full capsule from the committed repository, never author summaries; route affected owner sections or materially changed whole documents. Stage-specific focus must retain changed owners and decisive common-mode risks:

| Stage | Required focus | Avoid repeated work |
|---|---|---|
| Proposal | Normative account, scope, exclusions, Temporal preflight, separating counterexamples, [forward-compatible restrictions](../CLAUDE.md#forward-compatible-semantic-restrictions), completeness and present achievability of [required capsule content 15](capsules/README.md#required-capsule-structure) guards/oracles, joint satisfiability of constraints on one source field/edge across sections/endpoints, and producer-result-type compatibility across ordered decisions | Read existing contracts statically; do not run implementation gates for absent lanes |
| Semantic checkpoint | Changed source/admission, checked representation, IL/runtime/proof boundary, cross-target invariant matrix, nearest adversarial states | Do not review blocked byte-unadvanced artifact, CIB, differential or Temporal lanes |
| Closure | Evidence independence, differential and Temporal refinement/replay, meaningful mutations, exact status, epistemic closure, cost | Do not mechanically re-prove unchanged checkpoint bytes unless a cross-lane/common-mode risk reopens them |
| Combined | Complete checkpoint and closure scopes | Remove only the duplicate reviewer invocation |

Link each required guard/oracle. [Link checks](../scripts/markdown-links.test.ts) reject wrong referents, never omissions; reviewers assess completeness, achievable obligations, producer-order conflicts and jointly satisfiable shared-field constraints before implementation.

Commit the target; pause all writes to reviewed files. Review read-only against that commit/range. Perform the static claim scan of diff, full capsule, routed owners and adversarial invariants before heavy gates. Probe unresolved claims. A static blocker permits deferring routine focused gates unable to change the verdict, after necessary substantiation and full static checklist; name deferred gates/environmental limits. Never defer finding-confirming/refuting probes. The correction audit runs deferred gates once findings close; approval requires all applicable focused gates.

### Review packet

Generate [semantic-review-packet.ts](../scripts/semantic-review-packet.ts) from the exact target. The root records gates in a temporary JSON array of `{ command, exitStatus, elapsedMs, outputSha256 }`, hashing exact combined stdout/stderr per invocation. This is routing evidence, not independent proof: reviewers rerun decisive adversarial/focused checks and report disagreement. No packet verdict, diagnosis or conclusion is allowed.

```sh
node scripts/semantic-review-packet.ts \
  --stage <proposal|semantic-checkpoint|combined-checkpoint-closure|closure> \
  --baseline <strict-ancestor-commit> \
  --target <review-target> \
  --capsule docs/capsules/<CAPSULE>-PROPOSAL.md \
  --route 'docs/<OWNER>.md::<Title > Section > Subsection>' \
  [--migration-matrix <temporary-migration-matrix.json>] \
  --gates <temporary-root-gate-records.json>
```

Dependency-free `semantic-review-packet/v2` resolves full commits, requires baseline strict ancestry to target and target ancestry to `HEAD`, hashes full capsule/routed heading-path sections and records deterministic no-rename Git text line counts. Only pinned Maven-wrapper JAR/Linux-UI snapshot PNG binaries are admitted, with exact before/after SHA-256; other Git binaries, including NUL-bearing source/Markdown, reject. Sorted validated gates yield one `packetSha256`. Duplicate/missing routes, duplicate commands, malformed gates, unregistered binaries and bad ancestry reject. Repeat `--route`; reviewers check completeness.

Both immutable trees derive changed Markdown heading paths from ordered unit-digest sequences: duplicates/order count, unrelated ordinal shifts do not. References use `{ path, headingPath, revision, sha256 }`; revision selects baseline/target, null heading means full file. New/deleted documents, renamed/deleted/repeated headings, pre-heading changes and out-of-unit structural/fenced changes retain before/after file references. The full capsule gets file references; other changes stay in `changedFiles`. Navigation proves neither consistency nor affected-owner completeness. Historical digests keep original formats; format changes require no dependent review open.

For a bounded documentation migration whose review contract requires claim-by-claim preservation, supply exactly one temporary `--migration-matrix` with nonempty unique canonical Markdown `sourcePaths`; reviewers check completeness. [document-migration-matrix.ts](../scripts/document-migration-matrix.ts) derives Git baseline paragraphs/full list items/table rows, checks exactly-once coverage and exact target units or explicit changed/duplicate/history dispositions, and retains normalized source/target text. Duplicate rationale links the surviving owner section; sole records require destinations; history keeps baseline scope. Reviewers assess preservation, dispositions, hypotheses and exclusions beyond links. Matrix/packet commits must match; sources, normalized rows and exact matrix-byte SHA-256 enter `packetSha256`. The matrix is temporary review input, never a status owner.

### When a warm review is valid

Warm review is valid only for:

1. The exact cold reviewer auditing corrections against its original required findings.
2. Optional draft/uncommitted preflight before the immutable governed target, without receipt or independence claim.
3. A non-implementer reviewing routine non-material refactoring/integration that changes no governed claim.
4. The exact approved checkpoint reviewer closing the capsule after the executable continuity manifest proves byte-identical selected account, public contract, exclusions and evidence strategy.

Warm context is limited to those purposes. Closure requires a required approved checkpoint, descendant target, no later reviewer implementation and manifest exit zero. Baseline is its correction-audit commit after `approve-with-required-edits`, otherwise its review target. Select every material full heading path, including document title; the checkpoint reviewer rejects omissions and records the digest. Changed fingerprints/claims or missing checkpoint/thread requires a new `fork-turns-none` closure reviewer. Warm review never substitutes for other cold stages, self-reviews or carries redesign approval.

Generate the neutral hash-bound continuity input without another stored artifact:

```sh
node scripts/semantic-review-manifest.ts \
  --baseline <approved-checkpoint-commit> \
  --target <closure-target> \
  --capsule docs/capsules/<CAPSULE>-PROPOSAL.md \
  --account "<Title > Semantic rules>" \
  --contract "<Title > Public contract>" \
  --exclusions "<Title > Exclusions>" \
  --evidence "<Title > Evidence strategy>"
```

Repeat flags for multi-section contracts. The command resolves commits, hashes full capsule blobs/sections, lists changed files and emits deterministic `manifestSha256`: `0` means byte-identical selected boundaries, `2` means change. It proves no selection completeness and contains no diagnosis/verdict/gate claim.

### Review prompt

Name stage, target/baseline, capsule, packet digest, full-capsule requirement, routed owners/normative sources, focused gates and fixed output. Exclude diagnosis/preferred verdict/expected findings. Keep mechanical receipt/link/schema/hygiene/exhaustive-reader checks executable. Root-selected [three-level validation](TESTING-SPEC.md#three-level-verification-policy) requires no full rerun merely for review; reviewers use focused gates/adversarial mutations unless a finding needs the wrapper. Specialize only routed documents/claims:

```text
Review stage: <proposal | semantic checkpoint | combined checkpoint and closure | closure>
Target commit: <immutable SHA>
Baseline commit or range: <strict ancestor SHA>
Capsule: <relative link/path>
Semantic review packet: <packet SHA-256 plus JSON output>
what-binds map set: <actual map paths for the changed paths>

Work read-only. Read the capsule in full and the exact routed sections of other owner/source documents, inspect the exact target diff and implementation, and verify material claims against executable evidence. Do not modify files and do not infer implementation from prose.

Check affected claims and exclusions in unchanged owner passages. Use the what-binds map set and the boundary-specific owners to identify this context; the changed-section inventory does not establish semantic routing completeness. Report missing owner context rather than treating absence from the diff as evidence of consistency.

For Lean work, assess proof architecture using [Lean proof design and review](docs/REVIEW-POLICY.md#lean-proof-design-and-review). Inspect the composed guarantee, premises, invariant strength, shared transition contracts, induction interfaces and dependency direction. Distinguish necessary semantic cases from repeated implementation unfolding. Report concrete abstraction gaps and the smallest sufficient correction, or explain the evidence supporting the existing model; green compilation alone is insufficient.

Required output:
VERDICT: APPROVE | APPROVE WITH REQUIRED EDITS | REJECT
Decisive reason
Findings, each with classification, exact locus, unsupported or violated claim, evidence, and smallest sufficient correction
Common-mode risks and the nearest unsupported claim
Focused gates and environmental limitations
```

Report issue-first; name supported claims only to explain the verdict. Send three concise boundaries—target/scope confirmed, decisive findings established, gates/report ready—without duplicating the report or cataloguing successful checks.

### Corrections

`APPROVE WITH REQUIRED EDITS`/`REJECT` block. Commit corrections separately for warm audit by the exact same reviewer; name correction target and close/retain every required finding before approval. Advisories block only if applying them changes account/boundary. Material account/contract/exclusion/evidence-strategy changes invalidate review and require a new cold reviewer.

Corrections close findings; unsolicited rationale is new review material, committed separately. Source claims quote named loci; metamodel claims use normative machine-readable artifacts. Apply [the deletion test](DOC-DISCIPLINE.md#writing-and-linking); [Finding 02](PROCESS-ASSESSMENT-LEDGER.md#finding-02) retains the motivating false inheritance claim.

Audit at most twice per stage, bounding unattended spend rather than proving non-convergence or replacing root repair ([measured rationale](PROCESS-ASSESSMENT-LEDGER.md#finding-20)). After audit two, apply advisory/cosmetic findings without re-audit; state every open required finding in full and stop for owner direction on a third round, redesign or deferral. Only audit recursion is bounded; cold review stays mandatory/unbounded in scope. Receipts record every completed round.

### Review receipt

Record this concise receipt in the governed proposal/specification; do not copy transcripts or full reports:

```markdown
## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `<commit>` or `not-recorded` | `fork-turns-none`, historical `external-fresh-session`, or `not-recorded` | `approve`, `approve-with-required-edits`, `reject`, or `pending` | matching audit state |
| Semantic checkpoint | `<commit>` or `not-applicable` | `fork-turns-none`, `fork-turns-none-combined`, historical `external-fresh-session`, `not-recorded`, or `not-applicable` | `approve`, `approve-with-required-edits`, `reject`, `pending`, `not-required`, or `not-reached` | matching audit state |
| Closure | `<commit>` or `not-applicable` | `fork-turns-none`, `fork-turns-none-combined`, `checkpoint-reviewer-warm`, historical `external-fresh-session`, `not-recorded`, or `not-applicable` | `approve`, `approve-with-required-edits`, `reject`, `pending`, or `not-reached` | matching audit state |
```

Targets/audits are 7–40 lowercase hexadecimal Git commit objects ancestral to `HEAD`; CI full-history checkout is infrastructure-guarded. `approve`/`reject` audit is `not-required`; `approve-with-required-edits` lists completed audit commits comma-separated in round order. Listing more than two rounds requires `owner-authorized` last, invalid without rounds past the bound. One commit means one round under this contract; unchanged historical final-audit-only cells use stage prose for round count.

Pending rows may retain `not-recorded | not-recorded | pending | not-applicable` or existing explicit targets; neither approves. Pre-review packet/prompt binds target/digest without another commit. Record target/isolation/verdict/audit together in the verdict commit. Unnecessary checkpoint: other cells `not-applicable`, verdict `not-required`; otherwise checkpoint/closure stay `not-reached` until targeted. Receipt-update commits are targets only when substantive content is expressly reviewed.

[independent-review-policy.test.ts](../scripts/independent-review-policy.test.ts) recursively governs active proposals/specs under `docs/`, excluding archives/local references. Governed proposals and post-policy specs need receipts. Proposal `## Status` approval requires approved independent proposal review; post-policy graduation also requires approved closure. Warm closure requires strict checkpoint-target ancestry; identity/manifest completeness stay attested. Both combined rows require identical target/verdict/audit; first-green/full-closure stays attested.

Immutable `f1ef362` fixes grandfather membership: its active specs/three legacy root proposals, excluding the already-receipted Receive Task proposal. Never extend, append or rebase this selection/membership; later specs are post-policy. Immutable `b361681` changes only isolation: strict-ancestor targets retain historical proposal/closure `external-fresh-session` and checkpoint alternatives. The baseline, descendants and later side branches require `fork-turns-none`, except guarded warm/combined review. Preserve historical receipts, never create future external-session receipts.

Pending-checkpoint guards may require byte-identical next-lane roots and the plan/map blocker target. Approval must delete the capsule-specific pending barrier in the same change to prevent dead path inventories.

Gates validate repository facts, not runtime. Under `b361681`, cold/combined tokens attest no forked conversation or model/effort overrides; historical external-session receipts retain earlier attestation. Git cannot prove runtime configuration. Infrastructure branch protection, immutable receipts and no-inherited-context protocol expose this trust boundary.

## Capsule closure review

After the full gate is green, independently review:

- Exact established and nearest unsupported claims; realistic counterexamples and checked non-laws.
- Shared flawed fixture, interpretation, projection or calibration risks; observations depend only on admitted state and explicit inputs.
- Lean-law usefulness/hypotheses and every prose quantifier's quantified theorem or explicit exhaustive enumeration; finite fixtures/representative permutations do not suffice.
- Independence of BPMN, CIB, Lean, TypeScript and Temporal claims.
- Version/history policy and meaningful mutations: each name matches the injected defect and reaches a public/durable discriminator rather than an indistinguishable prefix.
- Duplicate builds, cleanup, harness coupling, dominant timing, document placement, stale status and removable complexity.
- Baseline/closure commits and reproducible nonblank code/documentation churn in [the cost ledger](CAPSULE-COST-LEDGER.md), compared with the nearest completed capsule rather than an impression of wall time. Read the selected full row and comparator; consult the row’s directly linked resource evidence only for the relevant resource claim.

Run `node scripts/capsule-cost.ts <baseline-commit> <closure-commit>` for nonblank code (hand-written Lean/TS/Java/JS) and Markdown `+added/-removed` measures; the dependency-free parser/blank exclusions are infrastructure-tested. Elapsed time requires retained start/closure timestamps, otherwise unknown, never inferred from commit dates. Mixed uncommitted worktrees cannot supply reproducible closure cost.

Answer [the self-assessment questions](PROCESS-ASSESSMENT-LEDGER.md#self-assessment-questions), then inspect matching complete findings through the [finding index](PROCESS-ASSESSMENT-LEDGER.md#finding-index). Record every escape under its mechanism, retaining the cumulative count and compact relevant provenance instead of another incident narrative. Its guard forbids `review question`/`accepted risk` at two or more instances: recurrence shows prose failed to bind.

### Milestone and capsule reflection

This epistemic-closure review runs separately after the technical gate is green and before a milestone or semantic capsule is marked complete. Under the 2026-10-21 owner direction in [CLAUDE.md](../CLAUDE.md#balance-semantic-breadth-and-usable-delivery) it applies at family closure, not per slice. In addition to the closure-review items above:

1. identify the nearest realistic counterexample and require either a checked non-law or an executable negative witness;
2. confirm every claimed separating witness differs at the approved public observation boundary; a hidden microstep, storage order, or evaluator choice is not a discriminator unless the contract exposes it;
3. when the comparison shows the measured cost did not fall, remove one identified process weight before starting the next capsule. The removed weight must bear on the measure that rose, or the row states why no such weight exists; a removal on an axis that already improved leaves the growing cost unaddressed and satisfies the only subtractive rule in this process without subtracting anything;
4. decide whether the result changes the next best step;
5. complete the applicable proposal, conditional semantic-checkpoint, and closure reviews under [the independent cold-review rule](#independent-cold-review-gate) before crossing their stage boundaries.

Answer the same self-assessment questions at each session handoff, not only at a capsule boundary. A finding that already has a row gets its instance count incremented rather than a second near-duplicate row, because that count is what the escalation rule reads: recurrence requires an executable guard or an explicit explanation that the class is unguardable under the ledger’s closed dispositions. Assume your own fresh prose does not bind you.

Turn every escaped issue into either a reusable review question or an executable guard, and record it in [the process-assessment ledger](PROCESS-ASSESSMENT-LEDGER.md) so a repeat is distinguishable from a first occurrence. Record each resulting correction in its existing owner: semantic meaning in the applicable [capsule](capsules/README.md), durable product and semantic boundaries in [PROJECT-DESIGN.md](PROJECT-DESIGN.md), concrete package and deployment architecture in [ARCHITECTURE.md](ARCHITECTURE.md), evidence and guards in the focused owner selected by [TESTING-SPEC.md](TESTING-SPEC.md#select-the-task-owner), implementation status in the applicable detail map routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](PLAN.md), and only reusable contributor behavior in this file. Do not create a retrospective diary per capsule.
