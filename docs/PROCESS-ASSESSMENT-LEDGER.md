# Process assessment ledger

**Status:** Maintained process-finding ledger.

## Purpose and denominator

This ledger records escaped weaknesses in how work was carried out, making recurrence visible instead of answering each repeat with fresh prose. It supports [capsule reflection](../CLAUDE.md#milestone-and-capsule-reflection) and [closure review](REVIEW-POLICY.md#capsule-closure-review), which require a reusable review question or executable guard for each escaped issue.

The denominator is process findings, not defects. A finding belongs here when it cost real work or produced a wrong intermediate result **and** an existing guard did not catch it. A defect that a gate rejected is not a finding: the guard already worked. Semantic claims, evidence strength, and common-mode risks stay with [the owning capsule](capsules/README.md); reproducible cost stays in [the capsule cost ledger](CAPSULE-COST-LEDGER.md); implementation status stays in the applicable detail map routed by [`implementation-status-router`](IMPLEMENTATION-MAP.md).

This is not a retrospective diary. Rows are findings with dispositions, one row per distinct mechanism, and no row narrates a session. The root record owns current controls and links retained recurrence evidence directly; the optional [folder index](process-assessment/README.md) browses the four evidence owners.

## Self-assessment questions

Answer these after a capsule or milestone closes, and again at each session handoff. A question whose honest answer is "I do not know" is itself a finding.

1. **Bounds.** Which executable guard, oracle, registry, or size ceiling already constrained this work, and did I enumerate them before the first edit or discover one mid-change?
2. **Recall.** Which structural claim did I state without reading its source in this session? For each theorem cited as evidence, what do its premises already assume, and which separating defect can its conclusion detect? Name the claim, not the intent to be careful.
3. **Rework.** What did I write and then discard? Was the deciding fact available before I started?
4. **Measurement.** Is every number I reported reproducible by a named command, and was any timing figure taken under competing load? Which resource dimensions did I actually measure, and did I draw a cost conclusion from fewer dimensions than the change can consume?
5. **Evidence reading.** Did I read each gate outcome from the run's own output, or from a summary, notification, or impression of it?
6. **Prose versus guard.** Which correction from the previous increment did I rely on prose to enforce, and did that prose actually bind me?
7. **Recurrence.** Does anything above already appear below? If so, its recorded disposition failed and must be escalated.
8. **Siblings.** For each correction I made, which other copies of the corrected fact did I open? Name the files and sections I actually read, not the intent to have been thorough. If the fact had more than one copy, why does it still have more than one?
9. **Exhaustiveness.** Which claim did I write as a count or as an "everything else" clause instead of as a criterion, and was the search behind it capable of missing a case?
10. **Delegated staging.** While any delegated lane was active, did I stage only the root-owned reviewed paths explicitly, and did I inspect the staged diff before committing?
11. **Stage boundary.** Which governed review stage did this work cross, and did I pause at it? Name the commit I paused at, or the lanes that were built past it before the review opened.

12. **Presentation choice.** What question does this screen answer, which facts need scanning versus sustained reading, and did I inspect realistic expanded content before calling the design usable?
13. **Outward action.** Before anything was published under the owner's identity — an issue, comment, pull request, push or post — did the owner see its exact text, and did their approval name that act rather than a direction?

## Escalation rule

A second occurrence refutes a prose-only disposition and requires an **executable guard**, unless no repository fact can observe the class; `unguardable` records that limit and its reason. Reporting and semantic claim-to-source judgments can have this limit even when narrower artifact defects are guarded. [The executable check](../scripts/document-reviewability.test.ts) rejects any row at two or more instances unless its disposition is `executable guard` or `unguardable`.

Dispositions are a closed set:

| Disposition | Meaning | Evidence cell must link |
|---|---|---|
| `executable guard` | A gate now rejects the class, not only the reported instance | at least one executable guard or script |
| `review question` | Added to the questions above or to a reviewer prompt; admissible only at a single instance | the document recording it |
| `accepted risk` | Understood, not worth a guard, and explicitly tolerated; admissible only at a single instance | the document recording the acceptance |
| `unguardable` | No repository fact can detect the class, so no gate can enforce it; admissible at any instance count but must state why | the reusable question standing in for the guard |

## Finding index

| Task | Current findings | Retained recurrence evidence |
|---|---|---|
| Plan scope, bounds and required consumers | [01](#finding-01), [05](#finding-05), [07](#finding-07), [16](#finding-16), [17](#finding-17), [26](#finding-26), [27](#finding-27), [52](#finding-52), [58](#finding-58) | [01](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-01), [17](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-17), [58](process-assessment/VERIFICATION-LEDGER.md#finding-58) |
| Establish claims and independent semantic evidence | [02](#finding-02), [11](#finding-11), [12](#finding-12), [41](#finding-41), [42](#finding-42), [43](#finding-43), [44](#finding-44), [46](#finding-46), [47](#finding-47), [48](#finding-48), [51](#finding-51), [54](#finding-54), [62](#finding-62) | [02](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-02), [12](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-12), [46](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-46), [47](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-47), [54](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-54) |
| Read gate results and measure resources | [03](#finding-03), [09](#finding-09), [18](#finding-18), [19](#finding-19), [24](#finding-24), [32](#finding-32), [40](#finding-40), [57](#finding-57), [60](#finding-60) | [03](process-assessment/VERIFICATION-LEDGER.md#finding-03), [09](process-assessment/VERIFICATION-LEDGER.md#finding-09), [24](process-assessment/VERIFICATION-LEDGER.md#finding-24), [32](process-assessment/VERIFICATION-LEDGER.md#finding-32) |
| Build guards and trustworthy harnesses | [08](#finding-08), [13](#finding-13), [21](#finding-21), [22](#finding-22), [25](#finding-25), [31](#finding-31), [33](#finding-33), [34](#finding-34), [38](#finding-38), [39](#finding-39), [66](#finding-66), [67](#finding-67), [68](#finding-68), [72](#finding-72) | [08](process-assessment/VERIFICATION-LEDGER.md#finding-08), [13](process-assessment/VERIFICATION-LEDGER.md#finding-13), [22](process-assessment/VERIFICATION-LEDGER.md#finding-22), [25](process-assessment/VERIFICATION-LEDGER.md#finding-25), [31](process-assessment/VERIFICATION-LEDGER.md#finding-31), [34](process-assessment/VERIFICATION-LEDGER.md#finding-34), [68](process-assessment/VERIFICATION-LEDGER.md#finding-68) |
| Maintain owned facts and complete correction sweeps | [06](#finding-06), [10](#finding-10), [14](#finding-14), [15](#finding-15), [37](#finding-37), [45](#finding-45), [55](#finding-55), [59](#finding-59) | [06](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-06), [14](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-14), [15](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-15), [45](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-45) |
| Delegate, review and commit complete outcomes | [04](#finding-04), [20](#finding-20), [30](#finding-30), [49](#finding-49), [53](#finding-53), [61](#finding-61), [63](#finding-63), [64](#finding-64), [65](#finding-65) | [04](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-04), [20](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-20), [30](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-30), [63](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-63) |
| Preserve identity, wire values and canonical order | [23](#finding-23), [35](#finding-35), [36](#finding-36), [50](#finding-50), [71](#finding-71) | [50](process-assessment/VERIFICATION-LEDGER.md#finding-50) |
| Design and verify user journeys | [28](#finding-28), [29](#finding-29), [69](#finding-69), [70](#finding-70) | In the current records |
| Bound helper processes and outward actions | [56](#finding-56), [73](#finding-73), [74](#finding-74) | In the current records |

## Findings

### Finding 01

Existing executable bounds were not enumerated before planning an atomic change, so an oracle, a module ceiling, and a registry obligation each surfaced mid-implementation.

Instances
: 16

Disposition
: `executable guard`

Evidence
: [change-binding enumerator](../scripts/what-binds.test.ts), [capsule binding inventory](../scripts/document-reviewability.test.ts), [module-size headroom](../scripts/source-hygiene.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

The enumerator reports constraints only when invoked on every actual added/grown path and its reported guards are read. It cannot enforce its own invocation or detect owners omitted from a capsule inventory; completeness remains review work. Re-run it after placement or scope changes, including documentation and guard edits.

Retained recurrence evidence: [Finding 01](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-01).

### Finding 02

Which module or conjunct enforced a behavior was asserted without opening or probing it, and the claim was wrong.

Instances
: 10

Disposition
: `unguardable`

Evidence
: [question 2](#self-assessment-questions)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

A prose attribution to a module, conjunct or theorem is not executable evidence. Probe the claimed boundary, read theorem premises, and seed the deciding conjunct where possible; arbitrary claim-to-source judgments remain unguardable under question 2.

Retained recurrence evidence: [Finding 02](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-02).

### Finding 03

A verification claim was made without establishing both the exact gate invocation's own result and the scope that invocation exercised.

Instances
: 16

Disposition
: `unguardable`

Evidence
: [question 5](#self-assessment-questions), [experiment union coverage](../scripts/lean-import-boundaries.test.ts), [pre-push selection guard](../scripts/pre-push-selection.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Read the exact invocation's accumulated output and completed receipt, not a notification, trailing command, filtered grep or gate name. Short gates must be the last command; long gates need the separate receipt assertion's exact success verdict. Seed mutations through the same built/composed gate that reports acceptance. No repository fact forces an author to invoke/read this evidence, so reporting remains unguardable; coverage holes have narrower executable corrections.

Retained recurrence evidence: [Finding 03](process-assessment/VERIFICATION-LEDGER.md#finding-03).

### Finding 04

A generated semantic-review packet or continuity manifest was hand-transcribed into the reviewer prompt, corrupting one digest even though the source artifact was exact.

Instances
: 5

Disposition
: `unguardable`

Evidence
: [question 5](#self-assessment-questions)

**First observed:** Earlier semantic-review packet transmission, repeated at [interchange admission](INTERCHANGE-ADMISSION-SPEC.md) closure, the identity bound proposal review, and Sequential Multi-Instance closure

Orchestration-message bytes are outside repository observation, so generated packets/manifests remain authoritative and compacted message copies are untrusted. Transmit generated bytes verbatim and distinguish internal `packetSha256` from the serialized-file digest.

Retained recurrence evidence: [Finding 04](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-04).

### Finding 05

A structural requirement was asserted from a proxy measurement rather than a demonstrated need, so an extraction was recorded as required for a file the work never grows

Instances
: 1

Disposition
: `review question`

Evidence
: [question 1](#self-assessment-questions)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

### Finding 06

A recorded conclusion outlived the measurement that made it true, because the premise was not stored beside it.

Instances
: 8

Disposition
: `executable guard`

Evidence
: [recomputed owner headroom](../scripts/document-reviewability.test.ts), [receipt-owned review state and evidence-owned gate tokens](../scripts/document-control-plane.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Recompute measurements at their owner; link that owner instead of copying figures or review/gate state into planning prose. The inventory guard recomputes only parsed capsule rows, not arbitrary prose; control-plane checks now bind review state to receipts and gate tokens to evidence.

Retained recurrence evidence: [Finding 06](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-06).

### Finding 07

A registered profile was landed without the live example its oracle requires, turning the complete gate red after the focused gates passed.

Instances
: 4

Disposition
: `executable guard`

Evidence
: [registered-profile Product 1 example coverage](../packages/temporal-adapter/testkit/test/product-example-configs.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

The second instance was the interchange composition profile: its source, Lean, CIB, differential, and Temporal evidence existed, but the Product 1 example catalog remained incomplete until the complete gate reached it. The correction replaces profile-by-profile recollection with exact registered-profile coverage, so any future profile without an example fails the focused port-free catalog gate

The third and fourth instances are the public subscription registration and bounded Transaction registration. Both omitted enrollment needed by existing public inventories; Transaction also omitted its runnable example. The existing catalog and example guards exposed the gaps. Their [closure cost records](capsule-costs/TRANSACTION-OUTCOME-LEDGER.md#transaction-closure-correction-and-cost-2026-09-26) retain failures; registration is complete only when those existing consumers agree.

### Finding 08

A collection-contributing match over a semantic variant used a wildcard arm, so a new family silently contributed nothing instead of failing to compile: a boundary Event was unreachable because its Activity edge was keyed on trigger kind, and a composite family's task and timer waits were missing from every public projection.

Instances
: 11

Disposition
: `executable guard`

Evidence
: [exhaustive variant inventories](../scripts/lean-source-contracts.test.ts) plus compile-time `never` exhaustiveness in [the open-set matcher](../packages/semantic-core/src/flow-node-occurrence-open-set.ts) and [the well-formedness declarer](../packages/semantic-core/src/runtime-state-well-formedness.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule, recurring in the [Activity data-output](capsules/ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md) capsule

Use exhaustive typed variant matches where the union is trusted; inventory both languages and retain a fixture for each new shape.

The Lean inventory guard cannot enforce TypeScript. Open-set and well-formedness matches now enumerate every `SemanticOperationKind` and terminate with `never`; deleting an arm confirms compiler refusal. The admission validator intentionally keeps fail-closed `default` over untrusted `unknown`, so its new-family coverage remains unguarded and this row stays open. Validator catch-alls can reject a valid new family rather than silently accept it; both directions need witnesses.

Retained recurrence evidence: [Finding 08](process-assessment/VERIFICATION-LEDGER.md#finding-08).

### Finding 09

A wall-time figure was measured while other work competed for the same cores, making it non-comparable.

Instances
: 4

Disposition
: `executable guard`

Evidence
: [host load recorded and asserted beside pipeline timings](../packages/differential/test/pipeline.test.ts), [contended-measurement rule](TESTING-SPEC.md#default-verification)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Record host load beside timings and inspect it before expensive gates. Reports retain consistent `cores`, `loadAverage1m`, `loadPerCore` and `loadPerCoreAtStart`; quote load with soft targets and compare start-load measurements. Sweep strays and read load before starting, not only before quoting results. The guard cannot force readers to consult the measurements.

Retained recurrence evidence: [Finding 09](process-assessment/VERIFICATION-LEDGER.md#finding-09).

### Finding 10

One external pin was restated in every consumer instead of derived from a single owner, so a host tool upgrade blocked the complete gate and no gate could have caught a bump that stranded a stale copy

Instances
: 1

Disposition
: `executable guard`

Evidence
: [pin owner agreement](../scripts/pinned-toolchain.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

### Finding 11

A shared harness assertion compared a proxy for a fact only one component observes — the state the host actually paused at — so each new evidence shape adds another scenario-name exception rather than correcting the proxy; that assertion now carries five

Instances
: 1

Disposition
: `review question`

Evidence
: [question 1](#self-assessment-questions)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

### Finding 12

Normative references were written into a durable profile artifact, its scenarios, and a Lean fixture without opening the pinned corpus: two named clauses that exist but describe other subjects, and one workflow-pattern row absent from BPMN 2.0.2 entirely.

Instances
: 3

Disposition
: `executable guard`

Evidence
: [normative reference resolution](../scripts/normative-reference-resolution.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Verify file-class coverage against the actual inventory and establish absence from corpus body text, not extracted headings.

Retained recurrence evidence: [Finding 12](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-12).

### Finding 13

A new guard's first formulation did not reject the defect it was written for, and was only found by seeding that exact defect: an unreferenced schema branch credited as reachable, a helper enum read as an empty value list, and a fabricated table row accepted on its table number alone.

Instances
: 16

Disposition
: `executable guard`

Evidence
: [seeded-mutation checks in the reference guard](../scripts/normative-reference-resolution.test.ts), [anti-vacuity in the schema coverage guard](../scripts/contract-schema-coverage.test.ts), [no bare Lean invocation](../scripts/verification-entrypoint.test.ts), [a case per dispatch path](../packages/bpmn-source/test/reference-target-admission.test.ts), [A12 product-boundary guard](../scripts/a12-boundary.test.ts), [fixed-root preservation guard](../scripts/a12-preservation.test.ts), [checked-route consistency guard](../scripts/contract-definition-artifacts.test.ts), [User Task metadata source controls](../packages/bpmn-source/test/user-task-metadata-source.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

A new guard needs a seeded defect at each syntactic position, dispatch path and direction of its claimed relation. Verify the seed reaches the artifact the assertion reads and read unfiltered runner output; changing an expected verdict or trusting a proxy certifies neither mechanism nor execution.

Retained recurrence evidence: [Finding 13](process-assessment/VERIFICATION-LEDGER.md#finding-13).

### Finding 14

A live status fact was restated away from its owner and outlived the change that falsified it: an ordered-work item kept a blocked label for eleven commits after the same document recorded it unblocked, a capsule Status section copied an absence inventory that three landed lanes made wrong, and a capsule denied the existence of a semantic-core test that the implementation map linked in the same commit.

Instances
: 8

Disposition
: `executable guard`

Evidence
: [ordered-work status agreement](../scripts/plan-status-consistency.test.ts), [RC launch documentation](../scripts/rc-showcase-catalog.test.ts), [screenshot inventory delegation](../scripts/walkthrough-screenshot-refresh.platform-test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Delete duplicated live claims and identify a surviving owner before deleting any fact. Named intra-document/status/catalog checks cannot decide arbitrary cross-owner prose truth. Protection covers the named launch contracts and screenshot inventories, not general prose consistency.

Retained recurrence evidence: [Finding 14](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-14).

### Finding 15

A checklist item was corrected only where attention already was, leaving its siblings unaudited: a capsule's Required evidence list was amended for the two scenarios under discussion while two other Required items stayed listed and absent, a stale claim was fixed in the owning map but not in the capsule that copied it, one Required-Lean list was corrected while the sibling list and matrix row restating the same obligation were not, and the correction for that then declared itself the single owner while one sibling enumeration survived.

Instances
: 31

Disposition
: `unguardable`

Evidence
: [question 8](#self-assessment-questions)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Collapse duplicated obligations rather than repeatedly synchronizing them. A gate can compare known statements but cannot decide arbitrary semantic equivalence or which copies an author opened; question 8 therefore asks for the actual owning and sibling passages read. Sweep by the corrected construct/claim across code, current/absence passages and unchanged owners, including every packet-routed owner. [Finding 65](#finding-65) guards enumerable changed-section routing only, never truth of unchanged claims.

Retained recurrence evidence: [Finding 15](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-15).

### Finding 16

A production-wide constructor correction was implemented from the two callers already under attention rather than from an executable producer census.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [production Process-start constructor census](../scripts/pre-release-architecture.test.ts)

**First observed:** Production Process-start host-input repair and closure-review census correction

The Workflow host-input repair updated generic and exact-definition Process starts while leaving Message Start and scheduled starts on the old two-argument call, even though the commit claimed every production start path. Those omitted siblings silently disabled continuation and correlation hosting until the aggregate M2 gate exercised both. This differs from the unguardable prose-equivalence sibling row above: the producer set has an exact source criterion and can be enumerated. The correction therefore walks the Temporal client TypeScript graph, derives every direct and scheduled Process-start constructor, verifies its exact third Workflow-chain argument and content-bound producer, and independently deletes each current argument to prove the guard fails.

### Finding 17

A same-change obligation a capsule wrote for itself was never performed, in the one place the capsule had already predicted no gate would look.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [capsule-cited requirement resolution](../scripts/document-reviewability.test.ts), [retirement-claim consistency](../scripts/document-retirement-claims.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Capsule-cited requirement resolution rejects a referenced requirement missing from its ledger without demanding rows from capsules about CIB extensions or runtime representation. Present-tense retirement claims are checked against declarations; unperformed future promises or silently dropped amendments are not. The reviewer list does not replace the capsule's own obligation list, so question 8 remains necessary.

Retained recurrence evidence: [Finding 17](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-17).

### Finding 18

A cost conclusion was drawn from one resource dimension while the change consumed another, and the unmeasured dimension took the host: converting 40 Lean fixtures to `decide +kernel` was measured in CPU only, declared affordable at about 5% of gate CPU, and then a branch added to the `fireTimer` dispatcher that every kernel-decided timer fixture reduces through drove one build past 7 GB of resident memory.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 4](#self-assessment-questions)

**First observed:** Interrupting Sub-Process boundary Timer capsule, observed while landing the Lean deadline arm

Two halves compound and both are recorded: the kernel reduces in RAM so `+kernel` trades memory as well as elaborator time, and a dispatcher branch is re-reduced by each downstream decided fixture rather than once. `review question` is admissible at one instance and the question now asks which dimensions were measured; the mechanism is not a repository fact, because no committed artifact records that a build was run without a memory ceiling

### Finding 19

A performance change was landed on a one-dimensional measurement and its second dimension took the host: converting every decided fixture to `decide +kernel` was justified by a −48% CPU figure, and the same change made a clean `lake build` peak at 7978 MB across four concurrent `lean` processes, because kernel reduction holds its terms in resident memory while Lake scales its build pool with core count.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [pinned gate parallelism](../scripts/verification-entrypoint.test.ts)

**First observed:** Kernel-decide conversion `ee193a3`, observed one day later

Three follow-on errors compounded it and each is part of the mechanism: the regression was twice attributed to the wrong commit by reasoning about authorship instead of reading timestamps, a polling watchdog was trusted to bound a process that allocates gigabytes between samples, and two conversions were reverted before the actual lever was found, so the revert cost CPU without recovering memory. The owner's recollection of the nine-hour window located the cause faster than three of the agent's own analyses

### Finding 20

A correction-audit loop ran three rounds with nothing bounding it, because each round closed its predecessor's findings while the correction itself introduced a new required defect.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [correction-audit round bound](../scripts/independent-review-receipt.ts), [receipt contract](REVIEW-POLICY.md#review-receipt)

**First observed:** Non-interrupting boundary Timer proposal review

[The receipt contract](REVIEW-POLICY.md#review-receipt) now limits unattended audits to two: apply remaining advisories without audit and present open required findings for owner direction. It records one correction commit per round and rejects more than two without final `owner-authorized`; older final-audit-only receipts retain their original historical meaning rather than reconstructed rounds.

Retained recurrence evidence: [Finding 20](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-20).

### Finding 21

A gate in the default lane required an input that this repository's own cache lock marks optional and disposable, so its verdict depended on which machine ran it.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [optional-cache independence](../scripts/contributor-setup.test.ts)

**First observed:** Normative-reference guard `3d86091`, observed on CI two days later

The normative-reference guard read the Markdown conversion of the OMG PDF, passed every local run, and failed both hosted platforms on the first push after it landed; the `verify` scope is declared complete with only the hash-bound official corpus, so that conversion is never provisioned there. Two properties hid it for two days: the conversion exists on the maintainer's machine, and no push ran the workflow between the guard landing and the failure. The fix removes the dependency instead of provisioning the artifact, because provisioning would have added a PDF-conversion toolchain to every runner to reproduce a file whose bytes depend on the converter version. References now resolve against a tracked project-authored label digest, checked equivalent to the previous regex over all 128 declared references and 576 probes before the swap

### Finding 22

A repository-wide prohibition was added to a governing document without measuring whether the repository already violated it, so the rule was false in the commit that introduced it: "`native_decide` remains excluded, because it moves trust to the compiler" landed while 56 tactic sites in six modules were live, five of them in maintained Conformance modules, each adding a `native_decide` axiom to its theorem's footprint.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [recorded native_decide exception set](../scripts/lean-source-contracts.test.ts), [question 3](#self-assessment-questions)

**First observed:** Interrupting Sub-Process boundary Timer capsule, observed at its semantic checkpoint

A repository-content prohibition needs a measured baseline and executable ratchet when introduced. The exception-set guard covers that construct, not arbitrary new prose rules.

Retained recurrence evidence: [Finding 22](process-assessment/VERIFICATION-LEDGER.md#finding-22).

### Finding 23

A composite identity was built on a safety assumption never checked against the domain's own validator: two host schedulers keyed durable timer ownership on parts joined by `U+0000`, beneath a comment asserting that no identifier value could then forge another key, while the shared wire domain admits that scalar, so moving the separator into an identifier produced a byte-identical key for two different committed timers.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [separator-built composite keys](../scripts/source-hygiene.test.ts)

**First observed:** [Event-Based Gateway](capsules/EVENT-BASED-GATEWAY-SPEC.md) capsule, repeated in Sequential Multi-Instance runtime-state admission

The second instance used the same delimiter in template literals for controller and Activity-occurrence uniqueness. The first guard covered only `Array.prototype.join`, so the same unsafe representation recurred through another host-language construct while satisfying the stated rule. The correction rejects the observable delimiter-built shape in both join and exact `U+0000` template forms; whether an arbitrary string later becomes a key is not statically decidable, but the unescaped separator construction is

### Finding 24

A comparative claim about a maintained table was written without reading the column it compares against: a documentation figure called the largest in its ledger while a larger row sat four lines above, a code figure placed between "the two nearest comparators" while a third lay between them, and a replacement rank and row count both guessed rather than computed.

Instances
: 11

Disposition
: `executable guard`

Evidence
: [cost-ledger row reproduction](../scripts/capsule-cost-reproduction.test.ts), [cost-ledger rank claims](../scripts/capsule-cost-comparison.test.ts), [graduated-specification headroom figures](../scripts/document-reviewability.test.ts)

**First observed:** [Interrupting Activity boundary Timer](capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md) capsule

Derive comparisons and totals from the same complete measurement and exact endpoints, never sampled rows, inherited review counts or remembered ranks. The first guard covers unambiguous cost-ledger rank forms; free-form "nearest recorded" prose remains review work, not a claimed nearest-in-value relation.

Retained recurrence evidence: [Finding 24](process-assessment/VERIFICATION-LEDGER.md#finding-24).

### Finding 25

An infrastructure change was reported as landed on the strength of a green run, where green was insensitive to whether the change did anything.

Instances
: 4

Disposition
: `executable guard`

Evidence
: [relative-segment cache paths](../scripts/contributor-setup.test.ts), [Boolean Temporal mutation witness](../packages/temporal-adapter/testkit/test/boolean-process-data-temporal.test.ts)

**First observed:** Corpus cache `994e6eb`, observed on the run that shipped it

Green is not evidence that an optimization or mutation affected its intended mechanism. Observe the effect independently; for refusal, prefer an admitted control, require the exact diagnostic and seed the mechanism rather than an expectation. The cache guard rejects repository-visible `..` glob segments, not values hidden behind expressions; absolute-root derivation has a separate anchor.

Retained recurrence evidence: [Finding 25](process-assessment/VERIFICATION-LEDGER.md#finding-25).

### Finding 26

A producer was implemented in the shape a later decision of the *same approved proposal* replaces, so it was written twice.

Instances
: 1

Disposition
: `review question`

Evidence
: [the proposal-stage review focus](REVIEW-POLICY.md#independent-cold-review-gate)

**First observed:** [Preserve-only admission](PRESERVE-ONLY-ADMISSION-SPEC.md) capsule

The preserve-only classifier's admission rules were built as booleans in the commits that added them, and the proposal's next decision — typed per-element diagnostics — requires each of them to return located records instead, so roughly 180 nonblank lines were rewritten and one predicate deleted outright. The deciding fact was not discovered during implementation; it was two sections further down the document that authorized the work. Implementation order inside one proposal is a plan decision, and a decision that changes a producer's result type belongs before that producer

### Finding 27

One source fact received incompatible requirements in two endpoint-local passages, so the approved proposal described no implementable model: the cyclic-control-flow proposal required both conditional Choice-to-Merge Sequence Flows and conditionless flows adjacent to the Merge, although each back-edge is the same Sequence Flow in both descriptions.

Instances
: 1

Disposition
: `review question`

Evidence
: [the proposal-stage review focus](REVIEW-POLICY.md#independent-cold-review-gate)

**First observed:** [Resumption-bounded cyclic control flow](capsules/CYCLIC-CONTROL-FLOW-SPEC.md) specification

The contradiction was discovered only when the source lane tried to construct the approved graph. A source field or edge has one owner even when several semantic components consume it, so proposal review now checks joint satisfiability across every passage that constrains that same fact

### Finding 28

A user-visible mutation invariant was translated into a successful browser script instead of a two-sided state transition, so strong backend authorization tests and a green end-to-end path concealed an illegal UI action and misleading recovery advice.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [Product 2 mutation-prerequisite and journey evidence](../scripts/ui-quality-boundary.platform-test.ts)

**First observed:** M3 human-work completion UI and its stale-claim sibling

The human-work contract required claimant-only completion and the product research described visibility, claim, work, complete, but every form-opening fixture began already claimed and the release journey claimed before it opened the task. An unclaimed task could therefore open an editable completion form, synthesize generation zero, receive a definite 404, and display uncertain-delivery retry advice. The independent stale-generation instance reached a definite 409 and was collapsed into the same uncertain state. Reviewers missed both because the required Chromium evidence named only the positive find/claim/complete sequence and never required the false precondition or stale race. The correction requires every offered workflow to have a production-backed headless-Chromium user journey, every mutation precondition to have a false-state browser oracle, and every definite refusal to remain distinct from transport uncertainty

### Finding 29

UI/UX precedent was postponed until after implementation, so browser quality evidence became the first comparison with an established operational product instead of verification of an informed design.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [Product 2 source-grounded UI/UX preflight](../scripts/ui-quality-boundary.platform-test.ts)

**First observed:** M4 incident operations and M5 committed-execution Diagram

M4 incident operations selected an Operations workspace without inspecting CIB Seven Cockpit's analogous incident/detail workflow, and M5 execution Diagram styling used red for current positions and marked scope containers before the later CIB Seven source/doc comparison showed red belongs to incidents, current work is distinct from selection, and exact active waits were missing. Both implementations had strong post-build focus, geometry, and screenshot evidence; none of those gates could reveal that the interaction model itself had skipped the available precedent. The correction makes analogous CIB Seven documentation and pristine pinned source the first Product 2 UI/UX input, requires adopted/deviated/excluded decisions and their project-owned facts before production code, and retains post-build UI quality as closure evidence

### Finding 30

Each audited version of a not-yet-committed review target was written to the same path, so every later version overwrote the bytes the reviewer had approved and the delta between audited and landed content could be attested but not diffed.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 5](#self-assessment-questions)

**First observed:** [Runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md)

Immutable versions permit an exact audited-to-landed diff; overwriting a scratch target permits only attestations. Preserve distinct draft versions; landing an immutable target lets ordinary guards inspect corrections. No repository fact can prove out-of-tree bytes were retained. [The route-atom guard](../scripts/structural-map-routes.ts) only governs repository content.

Retained recurrence evidence: [Finding 30](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-30).

### Finding 31

Verification obligations existed outside the aggregate gate that was treated as complete, and the gate could report only what it selected.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [test-selection coverage](../scripts/test-selection-coverage.test.ts), [pre-push security failure propagation](../scripts/pre-push-selection.test.ts)

**First observed:** [Runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md) closure follow-up

Selection must be reachability from automatically invoked gate roots, not any text naming a file or a package's uncalled script. Seed an orphan in an uncovered directory and retain anti-vacuity checks. The graph follows script/filter/runner edges, excludes the frozen A12 tree through its own manifest, resolves filtered `exec` paths in the package, asserts no unselected files and uses the temporal suffix glob. Database-free operations compilation closes the stripped-type feedback gap; database-specific behavior still needs its database. The shared security audit precedes path selection, with success, advisory/registry failure and dirty-tree controls.

Retained recurrence evidence: [Finding 31](process-assessment/VERIFICATION-LEDGER.md#finding-31).

### Finding 32

A gate parameter was written as a total for the catalog that existed when it was written, so later growth made it measure catalog size instead of the property it names.

Instances
: 4

Disposition
: `executable guard`

Evidence
: [derived cold ceiling and load gate](../scripts/pipeline-budget.test.ts)

**First observed:** [PLAN.md](PLAN.md) pipeline evidence

Rate-based targets preserve intent as catalogs grow; absolute process ceilings may require earlier availability, but must be guarded against their declared rate. Both phase ceilings derive from the budget owner/catalog, and breaches count only under comparable recorded load, with both threshold branches tested. `defaultWarmBudgetMs` remains manual because process deadlines/hosted checks read it before a case list exists; a guard-caught budget bump is not a new escape.

Retained recurrence evidence: [Finding 32](process-assessment/VERIFICATION-LEDGER.md#finding-32).

### Finding 33

One reviewed commit left four independent defects live for four days, all invisible for the same structural reason: the only lane that catches them needs a PostgreSQL database, the ordinary local loop is deliberately database-free, and the branch was a hundred and seventy-nine commits ahead of `origin/main`, so no workflow had run either.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [database-free compile coverage](../scripts/build-coverage.test.ts), [migration composition and epoch](../scripts/postgresql-migration-composition.platform-test.ts)

**First observed:** [PLAN.md](PLAN.md) Horizon 2 platform

The reviewed change left a removed constructor option in a caller, a global migration ordinal breaking two partial compositions, and a schema epoch inconsistent with worker readiness. Database-only compile feedback and four unpushed days hid them; this differs from simply not running a cheap available gate.

Guards now require database-free compilation of every package, whole-catalog/prefix migration composition and readiness epoch equality with the last migration. Real-database behavior still requires its explicit lane; cheap compile coverage cannot prove it, and earlier push feedback only shortens that historical delay.

### Finding 34

A guard was added to the gate that runs before any package is built, and it needed a built package.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 1](#self-assessment-questions); the reliable oracle is a clean machine, which no local check reproduces

**First observed:** [PLAN.md](PLAN.md) pipeline evidence

The first `verify.sh` infrastructure step is build-free. Relative `../packages/*/src/index.ts` imports can remain build-free; a blanket package-import prohibition would be wrong. Rate arithmetic stays in the build-free guard and catalog-dependent assertions live in the existing catalog test. No class guard is claimed for transitive import safety; clean-machine verification remains the oracle.

Retained recurrence evidence: [Finding 34](process-assessment/VERIFICATION-LEDGER.md#finding-34).

### Finding 35

An exact host-policy comparison treated an omitted optional SDK string as one representation instead of normalizing the service's neutral materialization, so the first live Schedule creation succeeded in Temporal and then returned HTTP 500 when description reported `comment: ""` rather than `undefined`.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [definition Schedule description normalization](../packages/temporal-adapter/client/test/definition-schedule-client.test.ts)

**First observed:** Product 2 definition-scheduling live witness

The mechanism is the trust-boundary normalization gap, not Calendar policy: the live failure occurred after accepted creation, and the predicted sibling `priority: {}` was observed in the same service description and already normalized correctly by its owning predicate. The root fix gives optional SDK text one canonical project representation and locks both neutral service defaults in the direct client test

### Finding 36

A host-language primitive default made malformed wire values indistinguishable from a valid semantic value: Jackson constructed a primitive Boolean record with `false` when the `value` field was missing or null, despite the tagged union requiring an exact non-null Boolean.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [CIB gate entrypoint](../scripts/verification-entrypoint.test.ts), [strict Java scenario codec](../runners/cibseven/src/test/java/org/bpmnlean/cibseven/ScenarioJsonTest.java)

**First observed:** Boolean Process-data semantic checkpoint review

The strict shared schema could not guard direct Java decoding, so the correction uses a boxed non-null field and locks both malformed forms at the codec boundary

### Finding 37

A binding-inventory command treated index membership as proof that a path existed in the worktree, so an unstaged rename made `git ls-files --cached --others` return the tracked deleted side and `what-binds` failed with `ENOENT` before it could enumerate the actual changes.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [change-binding enumerator](../scripts/what-binds.test.ts)

**First observed:** Boolean Process-data registration integration

The correction filters candidates through worktree existence and retains a tracked-deleted-path regression, so parallel or ordinary unstaged renames no longer disable the planning guard

### Finding 38

Source-only TypeScript path maps copied only some public package exports, so ignored local declarations resolved the missing `message-start` and `definition-schedule` subpaths while both clean hosted platforms and the pinned UI container failed.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [source-mapping completeness](../scripts/harness-source-policy.test.ts)

**First observed:** Hosted Verify and Product 2 UI runs at `995e61b`

The existing generated-output guards rejected explicit `dist/` imports but could not see a valid package import whose absent source alias fell back to the package export. The correction derives every source-mapped workspace package and public JavaScript export from manifests, checks both harness configurations, reports every missing sibling, and also closed the latent `temporal-workflow/workflows` omission found by the same sweep

### Finding 39

A concurrency witness treated creation of two raw SDK promises as proof that both requests were durably accepted, although its own lifecycle specification says accepted-handler draining cannot reserve future acceptance.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [completion lifecycle race classifier](../packages/temporal-adapter/testkit/test/completion-delivery.test.ts), [production lifecycle specification](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md#command-ingress-resolution)

**First observed:** Hosted macOS Verify run after the M4 incident-cancellation proposal receipt

A fast hosted runner let the winning Update close the Workflow before the losing request reached acceptance, so the raw SDK call threw instead of producing the semantic rejection the harness required. The correction routes the race through production ingress, retains both valid accepted-versus-closed lifecycle resolutions, rejects an unknown retained address, and seeds the pre-acceptance closure arm in a pure classifier test so local timing cannot hide it

### Finding 40

A hosted timing override claimed to provide a wider ceiling but repeated the portable default exactly, while the Node test and parent command independently repeated only five seconds more.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [hosted budget and derived-deadline policy](../scripts/verification-entrypoint.test.ts), [shared pipeline budget owner](../scripts/pipeline-budget.ts)

**First observed:** Hosted Ubuntu Verify run `31745835798` after M4 incident-root-cancellation graduation

The first expanded M4 pipeline completed every semantic comparison and replay, then failed Ubuntu by 74.873ms at the nominally wider ceiling; raising only that value would have exposed the lower process deadlines next. The correction gives the assertion and both process deadlines one typed budget owner and requires hosted verification to retain measured headroom above the portable default

### Finding 41

An aggregate boundary was described as exhaustive while its service-level tests exercised only interior and over-limit populations, so zero members, the exact ceiling, and a late unavailable member remained unproved behind green repository and package gates.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [flow-node metrics aggregate boundary tests](../platform/modules/operate/test/flow-node-metrics-aggregation-service.test.ts), [parallel result collection boundary tests](../packages/semantic-core/test/parallel-multi-instance-preservation.test.ts)

**First observed:** Flow-node occurrence metrics closure review

Boundary inventories must execute both sides of every stated cut and an all-or-error failure after a valid prefix, rather than treating nearby unit tests as aggregate evidence

The second instance was exposed during the 2026-09-20 proof/evidence review: TypeScript checked each parallel result's byte limit but omitted the assembled collection's canonical JSON limit, which Lean already enforced. Array overhead and JSON escaping independently reproduced the defect. Correction `61faeee7` applies the shared collection predicate before final retention or closure; retained tests distinguish 8,191/8,192/8,193 bytes, preserve the exact prestate and empty events on rejection, and exercise corrected retry and Timer interruption after unpublished partial results. Per-item admission is not evidence for aggregate admission.

### Finding 42

A derived semantic fact and the projector called its independent oracle shared the same constructors and owner resolver, so one wrong owner or Process identity could make both sides agree and pass.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [TypeScript lifecycle independence test](../packages/semantic-core/test/flow-node-occurrence-lifecycle.test.ts), [Lean lifecycle conformance](../BpmnSemantics/FlowNodeOccurrenceLifecycleConformance.lean)

**First observed:** Flow-node occurrence metrics closure review

Candidate facts must be constructed from the selected Program boundary and exact runtime record without invoking the current-state projector, then folded against that separately implemented projector with an otherwise-valid substituted owner or identity as the class mutation

### Finding 43

A test called a post-hoc summary of a correct production run a mutation even though it never replaced a producer, entered a production relation, or crossed a durable or public discriminator.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [Workflow occurrence mutation evidence](../packages/temporal-adapter/workflow/test/flow-node-occurrence-integration.test.ts), [real Temporal occurrence witness](../packages/temporal-adapter/testkit/test/flow-node-occurrence-temporal.test.ts)

**First observed:** Flow-node occurrence metrics closure review

A mutation claim must inject the defective candidate into the exact accepting relation and fail there; arithmetic disagreement after the accepted run proves only that the summaries differ

### Finding 44

A formal assurance claim assumed the semantic consequence it was meant to establish instead of deriving it from the actual transition relation.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [Lean lifecycle assurance laws](../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycleProofs.lean), [target-indexed Sequential Multi-Instance liveness law](../BpmnSemantics/SemanticProcess/SequentialMultiInstanceLaws.lean), [Lean lifecycle conformance targets](../BpmnSemantics/FlowNodeOccurrenceLifecycleConformance.lean), [Lean source contracts](../scripts/lean-source-contracts.test.ts), [verification entrypoint](../scripts/verification-entrypoint.test.ts)

**First observed:** Flow-node occurrence metrics closure review, repeated at Sequential Multi-Instance closure

The first instance named cancellation laws, but its checked theorems restated a helper's output without connecting the actual operation and stimulus branches or proving preservation outside the removed subtree. The second named conditional liveness, but its accepted-event structure carried close-or-decrease as a field rather than deriving that result from the target controller's iteration, completion, or interruption relation. A proof inventory must connect the exact relation branch to the claimed consequence and retain a separating target-indexed theorem or conformance fact, not package the conclusion as an input

### Finding 45

An exhaustiveness claim about source was written as a count and an "everything else" clause from a partial search, so each correction produced a new partial count: one paragraph of the runtime-state invariant proposal named four canonical insertion functions, then six, and still omitted `insertVariableBinding` while asserting that everything else prepends, which is false for the appended `variables.activities`.

Instances
: 9

Disposition
: `unguardable`

Evidence
: [question 9](PROCESS-ASSESSMENT-LEDGER.md#self-assessment-questions); prose helper membership is unguardable; explicitly listed RSI-ORDER-01 preservation remains executable, without proving omitted membership.

**First observed:** [Runtime-state invariant](RUNTIME-STATE-INVARIANT-SPEC.md)

State the membership criterion over the actual asserted proposition, not a counted sample or the insertion mechanism imagined by the author. No repository fact decides whether arbitrary differently named helpers belong to a prose category; question 9 stands in for that judgment. Once a collection is explicitly covered by `RSI-ORDER-01`, its executable preservation obligation can enforce the listed direction, never completeness of the prose inventory.

Retained recurrence evidence: [Finding 45](process-assessment/PLANNING-AND-OWNERSHIP-LEDGER.md#finding-45).

### Finding 46

A negative witness passed for a mechanism other than the one under test, twice in one correction round and on the same finding.

Instances
: 3

Disposition
: `executable guard`

Evidence
: [transition-independent gate witness](../packages/semantic-core/test/activity-occurrence.test.ts), [compile-time deadline exactness](../packages/semantic-core/type-test/boundary-timer-deadline.type-test.ts)

**First observed:** [Activity occurrence ownership](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) capsule, repeated at the Multi-Instance deadline correction audit

A refusal test must fail when its intended mechanism is reverted. The generalized witness changes one collection on an unadmitted element, retains a committing control, requires exactly one refusal class and becomes the only failure under a gated-set revert. One of the three classes has no transition-independent witness in the single-Timer fixture because that transition necessarily reads its wait; this is a declared class property, not unfinished coverage. Type-system guards inherit narrowing and need the same seeded-revert discipline.

Retained recurrence evidence: [Finding 46](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-46).

### Finding 47

A rule was asserted over two independent targets and enforced over one, and the asymmetry was invisible because the enforcing guard's own scope was never stated.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [two-language pairing enumeration](../scripts/activity-occurrence-join.test.ts), [sequential Multi-Instance differential cases](../packages/differential/test/sequential-multi-instance-pipeline-cases.test.ts)

**First observed:** [Activity occurrence ownership](ACTIVITY-OCCURRENCE-OWNERSHIP-SPEC.md) capsule

The census now covers both languages, separates cross-family pairing from same-family identity checks, and requires a record lookup: absence of bad joins is vacuous when nothing is paired. Cross-target wire/projection and differential evidence accompany a contract; TypeScript schema checks alone do not establish two-language coverage.

Retained recurrence evidence: [Finding 47](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-47).

### Finding 48

An ownership relation was checked only from listed child to owner, so an empty child collection satisfied the universal check and surplus owner-local children outside each resolved pair escaped.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [TypeScript bidirectional binding negatives](../packages/semantic-core/test/sequential-multi-instance-controller.test.ts), [projection refusal](../packages/semantic-core/test/sequential-multi-instance-observation.test.ts), [Lean bidirectional binding negatives](../BpmnSemantics/SequentialMultiInstanceConformance.lean)

**First observed:** Sequential Multi-Instance closure correction audit

Sequential Multi-Instance admitted an open Activity record after its controller was dropped and admitted extra same-operation task or Timer waits in both languages; public projection inherited the same one-way resolver. A complete binding checks both directions through an operation-local census and retains missing-controller and surplus-child negatives in each semantic target and at projection

### Finding 49

A whole-tree staging command captured a delegated lane's in-progress files, so a commit shipped work the root had neither reviewed nor gated.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 10](#self-assessment-questions)

**First observed:** Sequential Multi-Instance capsule, at the outer-entry increment

The root integrator owns commits, and one Lean lane was mid-edit on three modules in the same worktree when the root committed an unrelated TypeScript increment with `git add -A`; the lane's new conjuncts landed at `HEAD` while the preservation proof they invalidate was still unwritten, so that commit's Lean build fails. Nothing about the lane was wrong and no file ownership was violated: the concurrency rule assigns disjoint files, and this defeated it from outside by staging the union rather than the assignment. The mechanism is that `git add -A` is not lane-aware, so while any lane is active the root must stage its own paths explicitly. Reverting is the wrong correction because the lane still holds those files; the honest one is to say so and let the lane's own commit close the build.

### Finding 50

A host-language convenience comparator was used where the repository has one canonical order, and prose next to it did not stop the next author.

Instances
: 21

Disposition
: `executable guard`

Evidence
: [no locale-sensitive ordering in executable TypeScript](../scripts/canonical-ordering.test.ts)

**First observed:** Sequential Multi-Instance semantic-checkpoint review

`localeCompare` depends on ICU locale. The prohibition now covers every project-authored executable TypeScript surface and seeded property, optional-chain, computed-access and collator-constructor forms, not only the syntax originally found.

Retained recurrence evidence: [Finding 50](process-assessment/VERIFICATION-LEDGER.md#finding-50).

### Finding 51

A per-field correction relocated an invariant violation instead of removing it, inside a correction round closing a finding about that very class.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [both count identities on the separating state](../packages/semantic-core/test/sequential-multi-instance-observation.test.ts)

**First observed:** Sequential Multi-Instance semantic-checkpoint review

A published tuple asserted two normative identities and derived one quantity twice from two places; correcting the first derivation satisfied the first identity and broke the second on the same state, and the new test asserted only the identity that had been raised. The mechanism is that a tuple claiming several identities has one root, the set of counts every field derives from, so a fix applied field by field moves the disagreement between fields. The discipline is to assert every stated identity on the state that separates the derivations, in the same test, and to confirm the added assertion by restoring the old derivation and observing that it alone fails

### Finding 52

A general rule was stated to justify a local decision and then implemented in one family.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 9](#self-assessment-questions)

**First observed:** Sequential Multi-Instance semantic-checkpoint review

Deciding that interruption withdraws every Timer a removed Activity occurrence record listed, rather than only the resolved one, was justified by the general invariant that removing a record leaves no wait it named live. The reviewer checked whether the rule was general and it was not: two of four Activity families withdraw a single resolved wait in both languages, on states the invariant admits, and the obligation lived only in code comments and the capsule rather than in the specification that owns record lifecycle. Justifying a bounded choice with an unbounded rule creates exactly the pile of special cases the root-cause discipline names, so the rule belongs in its owning specification with every family either migrated or recorded as an exception

### Finding 53

A delegation prompt split one review finding across two lanes and assigned only one half, then miscounted its own item list so the omission read as deliberate.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 8](#self-assessment-questions)

**First observed:** Sequential Multi-Instance correction round

The lane stopped and asked rather than guessing at a limits contract, which cost one round trip instead of a wrong implementation, and it was the lane rather than the author that noticed. A finding that spans two targets needs its owner named per target in each prompt, because the half a prompt omits is invisible to the lane that would have implemented it

### Finding 54

A document's central entailment was asserted in prose rather than checked against the definitions it cites, and the missing premise was already written in a docstring in a file the author had read.

Instances
: 5

Disposition
: `unguardable`

Evidence
: [question 9](#self-assessment-questions)

**First observed:** Runtime-state identity bound proposal review

Write entailments as explicit premises/conclusion and verify each premise against its supplying definition, including invariant anchors and transition enabling conditions. Arbitrary prose justification is a semantic review judgment; inventing a citation convention merely to claim a guard would not enforce it.

Retained recurrence evidence: [Finding 54](process-assessment/SEMANTIC-EVIDENCE-LEDGER.md#finding-54).

### Finding 55

A producer keyed its result collection by one identity while every consumer read it by another, and the convention that made the two equal was unwritten.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [case identity guard](../packages/differential/test/pipeline-catalog.test.ts)

**First observed:** [Activity data-input mediation](capsules/ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) capsule

The Temporal target indexed its batch by pipeline case identity; the projection and the replay lane both looked results up by scenario identity, and fifty-seven existing cases happened to name both the same, so the mismatch had never had a case to fail on. The first case whose two names differed failed as `Temporal omitted scenario` after the entire Temporal batch had run, naming the consumer rather than the producer. The producer now keys by scenario identity like the other three targets and rejects a repeat, and a cheap catalog guard requires every case to be named after the scenario it runs, so the equality the shared key space depends on is asserted before any host starts

### Finding 56

A helper process was started with no way to stop itself, and its only exit was a cleanup step that never ran.

Instances
: 1

Disposition
: `unguardable`

Evidence
: [self-terminating helper processes](../CLAUDE.md#verification)

**First observed:** [Activity data-input mediation](capsules/ACTIVITY-DATA-INPUT-MEDIATION-SPEC.md) capsule

Eight `while :; do :; done` load generators were spawned to measure a gate under CPU pressure; `PIDS=$(jobs -p)` captured nothing because command substitution runs in a subshell that owns no jobs, so the `kill` succeeded against an empty list, the loops were reparented to `init` when their shell exited, and they ran at about 80% CPU each until the owner reported a load average above 100. Two consequences outlast the cleanup: every figure measured while they ran is contended and was briefly reported as a quiet-host baseline, and a separate killed test run had also left an ephemeral Temporal server listening for 44 minutes. The correction is a lifetime rule rather than a better capture: bound every started process with `timeout`, a deadline, or a fixed iteration count so no failure path can strand it, capture `$!` per job when an identity is still needed, and sweep for strays before reporting any host measurement

### Finding 57

A witness raced a real host clock for a deadline the model states in logical time, and passed or failed by machine speed with nothing naming the clock.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [host-clock deadline margin](../packages/temporal-adapter/testkit/test/host-clock-deadline-margin.test.ts) and [armed-deadline poll allowance](../packages/temporal-adapter/testkit/test/temporal-worker-test-support.test.ts)

**First observed:** [Sequential Multi-Instance](capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md) and [Parallel Multi-Instance](capsules/PARALLEL-MULTI-INSTANCE-SPEC.md) capsules

A boundary deadline is armed as `deadlineMs - logicalTimeMs`, so a conformance host that never submits a logical instant turns the whole semantic deadline into a wall-clock budget. Both Multi-Instance natural paths had to complete three Update round trips and one Worker replacement inside 1,000 ms; that cost 328 to 355 ms on a quiet eight-core host and about twice that on the recorded four-core runner profile. Under the composed gate the witnesses failed while reporting the semantic consequence the schedule caused, a completion rejected because interruption had already won, so every symptom pointed away from the cause.

### Finding 58

A per-family exact value was raised in one family and the shared type it flows through was widened to accept both, so the four sibling families silently lost their own exactness.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [cross-family deadline refusal](../packages/semantic-core/test/admission-composition.test.ts), [sibling deadline in the Multi-Instance arm](../packages/semantic-core/test/sequential-multi-instance-admission.test.ts)

**First observed:** Multi-Instance `PT5S` semantic-checkpoint review

Parameterize shared arm type, validator and each schema reference by its family's deadline, never enlarge a shared shape's domain for one family's constant.

Retained recurrence evidence: [Finding 58](process-assessment/VERIFICATION-LEDGER.md#finding-58).

### Finding 59

A downstream copy of a growing upstream contract was typed as the subset it republishes, so every upstream field addition became a wire break instead of a value the copy ignores.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [Work service narrowing](../platform/modules/work/test/work-service.test.ts)

**First observed:** Activity data-input Product 2 adoption

Product 2's Work module declared its gateway port as `PublicWorkTask["task"]` while Product 1 supplied its own `OpenUserTask`, and the two happened to agree; adding the Activity data-input `inputs` collection made the engine value reach the Work snapshot verbatim, where Product 2's own strict decoder refused the whole page. The coupling had already fired once, for `metadata`, and was invisible because an optional excess property is assignable in a non-fresh position. The correction narrows engine-observed tasks through one allowlist of the fields the Work contract owns, so the class is closed by construction rather than by remembering to mirror each new field

### Finding 60

A cost ratchet keyed on a module's own source bytes was read as though it bounded that module's cost, so a figure the guard never asked to re-measure drifted far from the truth: `ParallelUserTaskMetadataCompositionConformance` was recorded at 2,718,336 KiB, and re-measuring the *parent* commit under the same container showed 3,272,540 KiB, already above the near-cap disclosure threshold and undisclosed.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 4](#self-assessment-questions), extended to ask whether a recorded cost figure's measurement trigger can observe the change that moved it

**First observed:** Activity data-output capsule, found while re-measuring two modules the ratchet did flag

Nothing in the module changed; its dependency closure grew. The mechanism is that a ratchet with a source-bytes trigger measures authorship, not cost, and cost enters through imports. The first honest attribution also needed a baseline run the process does not require: the recorded row was too old to subtract from, so a 3.3x apparent regression had to be measured against the parent commit before it resolved to about +0.3% memory. Recorded as `review question` at one instance because the corrective guard is not obvious: re-measuring every conformance module on every dependency change is the whole Lean gate under a memory bound, and picking a cheaper trigger is a design question rather than a missing assertion

### Finding 61

A governed review stage was crossed without pausing at it, so the review opened after later lanes had already been built on the unreviewed state.

Instances
: 1

Disposition
: `review question`

Evidence
: [question 11](#self-assessment-questions)

**First observed:** [Activity data-output mediation](capsules/ACTIVITY-DATA-OUTPUT-MEDIATION-SPEC.md) capsule

The conditional semantic checkpoint fires at the first green implementation commit of a capsule that changes a wire contract, checked graph or IL, runtime observation, admission capability, transition family, or proof boundary; this capsule changed all six and went on to land a real-service Temporal witness, a Lean cost re-measurement, and a source-hygiene extraction before anyone noticed the boundary. The stage was recoverable only because none of those lanes was green either: the first commit at which every lane passed became the review target, and the reviewer returned three required findings against the implementation core, one of them an entire absent evidence lane that the closure stage is explicitly instructed not to re-derive. Nothing in the process announces the boundary — it is a conditional written in prose, evaluated by the author, against a capsule the author is in the middle of implementing — and the receipt guard accepts `not-reached` because it cannot evaluate that condition either

### Finding 62

A command result retained its success outcome and speculative successor after internal closure failed, while downstream publication withheld the corresponding semantic facts.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [whole-command rollback tests](../packages/semantic-core/test/closure-atomicity.test.ts), [late-ambiguity publication tests](../packages/semantic-core/test/semantic-transition-publication.test.ts), and [Workflow failure classification](../packages/temporal-adapter/workflow/test/closure-failure-classification.test.ts)

**First observed:** external review of [internal closure atomicity](capsules/INTERNAL-CLOSURE-ATOMICITY-REPAIR-SPEC.md)

Fuel exhaustion and late ambiguity independently exposed the same broken command boundary after successful admission. The caller-visible result now restores the exact pre-admission state and removes speculative publication; quantified Lean laws cover both result producers. The Workflow checks infrastructure failure before its success-only publication and recovery processing. Its separating probe requires the intended failure type after recovery admission and keeps a successful recoverable completion as the positive control.

### Finding 63

Integration handoffs were treated as commit boundaries, and supporting proof prerequisites became separate review checkpoints, multiplying each increment into implementation, evidence, and acceptance commits.

Instances
: 9

Disposition
: `unguardable`

Evidence
: [commit boundaries](REVIEW-POLICY.md#commit-boundaries) and [instruction regression guard](../scripts/independent-review-policy.test.ts)

**First observed:** owner review of the scope-creation commit cadence on 2026-09-18. The six implementation/evidence/acceptance triples are retained in `598f7365..36cce36d`.

The contributor instruction made green lanes commit triggers and prohibited grouping separately compiling helpers. Cost/receipt ordering amplified that confusion. [Commit boundaries](REVIEW-POLICY.md#commit-boundaries) now group supporting work by complete outcome while retaining early review for new claims/risks; source-digest measurements and pre-review packet binding remove forced bookkeeping commits. The instruction guard rejects forced handoff commits, not arbitrary judgments of outcome usefulness.

A proposed completeness guard remains deferred: it would allow these checkpoints and miss the recurrence. Reopen only for concrete false acceptance using full elaborated theorem types, checked-source-bound evidence and an obligation baseline fixed by approved target. Masked text omits literals/inherited assumptions; imports/axioms do not prove unchanged guarantees. This separate assurance idea is no prerequisite for regional/arming proof. Judgment of the new claim/risk requiring early review remains unguardable.

Retained recurrence evidence: [Finding 63](process-assessment/REVIEW-AND-DELIVERY-LEDGER.md#finding-63).

### Finding 64

Optional investigations consumed open agent threads without reserving the capacity required for independent closure review; completed tasks were mistaken for released thread capacity.

Instances
: 1

Disposition
: `unguardable`

Evidence
: [thread-capacity rules](../CLAUDE.md#delegated-implementation), [questions 3 and 10](#self-assessment-questions)

**First observed:** owner review of agent-thread exhaustion during the 2026-09-20 architecture/workflow follow-up.

The 2026-09-20 review follow-up stalled at the required reviewer because the session could neither spawn nor resume a reviewer and exposed no thread-close operation. This counts the blocked outcome once, not each failed retry. Routine investigation stays with the root, capacity is reserved for required reviews, and the exact reviewer is reused for corrections and eligible closure. Repository guards cannot observe the orchestration service's open-thread quota or release a slot; instruction checks do not enforce runtime allocation.

### Finding 65

A review packet listed a changed Markdown file but manually routed an unchanged sibling section, omitting the changed section from review navigation.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [packet position and CLI regression tests](../scripts/semantic-review-packet.test.ts), [review-prompt contract](../scripts/independent-review-policy.test.ts), and [packet/migration contract](REVIEW-POLICY.md#independent-cold-review-gate)

**First observed:** exact Merge review at `cd114dd6`: the differential README change was under `Learn more`, while the packet routed `Quick start`.

The packet derives changed heading paths from ordered document-unit digests in both immutable trees and retains file references for structural, fenced-code, ambiguous, new or deleted content. Tests seed each position, duplicate occurrences, reordering, and the misleading sibling route through the CLI. This splits the enumerable routing-omission class from [Finding 15](#finding-15); that finding's arbitrary prose-consistency class remains unguardable. The prompt assertion preserves an explicit check of affected unchanged owners using the computed map set and boundary owners; it does not prove the reviewer performed that check or identified every affected claim.

The documentation/tooling correction received a context-cold review and three same-reviewer correction audits; the owner explicitly authorized the third after the two-audit stop. Final approval at `a0e5355e7a28225b1b9ad98e8b4f782d7cca60ff` closes the structural/separator fallback and stale invariant-map findings, with no remaining required or advisory findings.

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Closure | `6991ced1` | `fork-turns-none` | `approve-with-required-edits` | `c3ffac0b, 34c7c24d, a0e5355e, owner-authorized` |

The final packet is `97ec011b8c4c0ecc3bdbdaab783843a30dc9b25aa7ff80d1dba39bd696bd587e`; its temporary migration matrix binds seven source documents and 1,440 source units. The reviewer verified the digests and separating red/green receipts, including 20 focused and 582 complete infrastructure checks. This approval covers documentation preservation and review navigation only; arbitrary prose consistency, source-set completeness, and Internal Commutation closure are not established by these guards.

### Finding 66

A terminal-state classifier omitted valid Process-status alternatives: a complement of Running included NotStarted and absent state, while an incomplete expected-outcome switch silently admitted Failed. Tests did not separate every status from the selected terminal outcome.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [terminal harness-state classification](../packages/temporal-adapter/testkit/test/harness-evidence.test.ts) and [Alpha expected-outcome validation](../showcase/mue-preview-alpha/test/automated-actor.test.ts)

**First observed:** Public Compensation registration closure review at `953f5d64`.

Both harness consumers now share an explicit status classifier. The separating guard covers every Process status and absent state, and still requires exact durable receipts for Completed, Cancelled and Failed. A category defined over an enum must account for all alternatives rather than infer membership from one excluded value.

The second instance was reported during failed-Process proposal review at `fd1e18f0`. Alpha accepted a failed observation after every configured response had been consumed because its status switch fell through and the generic interaction driver legitimately treated failure as terminal. Both natural and interrupted journeys reproduced false success. The actor now rejects failed and unknown statuses explicitly; both separating tests retain the completed-journey controls. This is a non-material test-actor correction: no Alpha or engine admission changes. The two red cases, complete Alpha unit/type gate, document-reviewability guard, and browser/replay acceptance after the separate native-enrollment bootstrap correction cover it.

### Finding 67

An evidence assertion inferred legacy Service Task behavior from absence of one Compensation profile ID. A second profile reused the Compensation mechanism, so both the Activity-policy inventory assertion and registered pipeline counter assertion selected the wrong evidence contract.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [complete public Activity-policy inventory](../packages/temporal-adapter/workflow/test/effect-activity-policy.test.ts), [registered cross-target pipeline](../packages/differential/test/pipeline.test.ts)

**First observed:** Transaction public-catalog qualification at `6229db87`.

Both assertions now classify the two current profiles explicitly. The pipeline retains ordered Activity request/result/dependency/cancellation history checks and legacy Service Task probe requirements; two different Transaction schedules reproduce the original mismatch. No production semantics or additional proof framework changes.

### Finding 68

Maintained acceptance hosts connected versioned Workers without establishing native Current enrollment. Type checks and UI fixture tests passed, but public starts failed before the live witnesses reached their claimed behavior. Repairing the first host without auditing sibling bootstrap paths left the same prerequisite missing elsewhere.

Instances
: 7

Disposition
: `executable guard`

Evidence
: [acceptance-host bootstrap guard](../scripts/platform-harness-policy.platform-test.ts), [correlated Message production-browser journey](../showcase/m2-correlated-message-ingress/e2e/correlated-message-ingress.spec.ts), [native enrollment contract](TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md#required-deployment-contract)

**First observed:** final MUE RC qualification at `73872c18` on 2026-09-26.

Fresh hosts initialize a named Namespace/Current deployment before public starts; commands/inspection use that Namespace, replacement Workers connect only, and absence witnesses stop the initializing Worker before command ingress.

The discovered-source guard seeds connect-only initialization/default-Namespace fallback. It proves neither arbitrary control flow nor Namespace equality; live journeys decide readiness, replacement, response loss, exact identity, privacy and replay. Enumerate release-command live witnesses and reuse only exact matching-input evidence; [PLAN.md](PLAN.md#current-evidence) owns current qualification, never historical UI/release greens.

Retained recurrence evidence: [Finding 68](process-assessment/VERIFICATION-LEDGER.md#finding-68).

### Finding 69

API-shaped presentation placed long structured records in ordinary table cells. Guidelines emphasized control mechanics without a content-selection rule, and collapsed-state screenshots plus overflow checks were mistaken for evidence of readable expanded content.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [Action history expanded-record checks](../showcase/platform-ui-quality/e2e/action-history.spec.ts), [Process instance detail checks](../showcase/platform-ui-quality/e2e/rc-feedback-copy.spec.ts), [content-first presentation](BPM-PLATFORM-UI-DESIGN-SPEC.md#content-first-presentation)

**First observed:** owner review of expanded Action history on 2026-09-28.

The Action history JSON Details cell and Process-instance cards confined long records to 188/371 pixels; middle alignment/stretched cells separated headings from values. Full-width reading rows now follow compact top-aligned summaries, with readable facts before optional raw data. Browser checks cover width, placement, stable summary height and keyboard collapse, not arbitrary user usefulness. Question 12 and the content-first owner require content selection before components; existing beginner/journey requirements already applied, so the missing specific guideline did not excuse ignoring them.

### Finding 70

Async request ownership followed component or client lifetime instead of the operation's user-visible scope, so unrelated work superseded valid results or a late result reclaimed navigation.

Instances
: 2

Disposition
: `executable guard`

Evidence
: [Start navigation lifecycle](../showcase/platform-ui-quality/e2e/definition-selection-lifecycle.spec.ts), [publication/export concurrency](../platform/apps/web/test/process-execution-api.test.ts)

**First observed:** recent-change RC audit on 2026-09-30.

Leaving a retained Start panel now revokes that invocation's navigation token permanently without discarding its receipt. Publication polling and export keep separate generations; changing the instance invalidates both. Separating tests cover leave-and-return, version changes, both request completion orders and same-kind supersession.

### Finding 71

Private generated identifiers assumed a reserved namespace absent from the public source contract; representative fixtures never occupied those names.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [diagram seed collision tests](../platform/foundation/bpmn-definition-projection/test/showcase-diagrams.test.ts)

**First observed:** recent-change RC audit on 2026-09-30.

The layout seed allocator reserves every parsed source ID and every new allocation. Tests occupy diagram, plane and shape seed names plus successive suffixes, require expanded Sub-Processes and repeatable composition, and retain the ordinary-source control.

### Finding 72

Workflow checks asserted that steps existed without evaluating their shared event, ref and input conditions, so permitted combinations omitted prerequisites or ran publication after smoke-only execution.

Instances
: 1

Disposition
: `executable guard`

Evidence
: [evaluation workflow condition matrix](../scripts/evaluation-distribution.platform-test.ts)

**First observed:** recent-change RC audit on 2026-09-30.

The guard evaluates actual step predicates across branch, phase-tag and version-tag dispatches with independent publishing and screenshot inputs. Release validation and attachment require version-tag publication; every bundle-producing path prepares its pinned toolchain.

### Finding 73

An ad hoc command relied on unquoted parameter expansion to split a list into words, under a shell whose splitting rules differed from the author's assumption.

Instances
: 3

Disposition
: `unguardable`

Evidence
: [self-terminating helper processes](../CLAUDE.md#verification)

**First observed:** V8 corrected-build validation on 2026-10-01.

The failing commands were typed interactively and never entered a tracked script, so no repository fact can observe this class. zsh does not word-split an unquoted `$files` or `$pids`. One copy loop therefore failed before a patch was applied, and one `kill` of bounded CPU spinners matched nothing. A third command, inside `bash -c`, split a `PATH` containing a space so that `env` failed before its gate started. The bounded `gtimeout` lifetimes contained the stray spinners, and no measurement was taken while they ran. The reusable question: before relying on a multi-word expansion, does the command run under the shell whose splitting it assumes, with every list held in an array and every value quoted?

### Finding 74

An approval of a recommended direction was treated as approval of an outward-facing act whose content the owner had not seen, so text was published under the owner's identity without review.

Instances
: 1

Disposition
: `review question`

Evidence
: [self-assessment question 13](#self-assessment-questions)

**First observed:** TD-005 upstream report on 2026-10-01.

The owner answered four recommendations with "take all steps with your recommendations" and "with the fix for Node, let's do this together". The agent read "together" as covering only the runtime switch and filed [Node issue 66439](https://github.com/nodejs/node/issues/66439), including the private patch, from the owner's GitHub account. The owner meant the upstream report as well. Publication cannot be undone, so the cheap check is to show the exact draft and ask once before the act, even when a direction was approved.

## Update rule

At each capsule closure and session handoff, answer the fixed questions and either add a finding or record that none applied. Increment an existing mechanism's true cumulative instance count instead of creating a near-duplicate. Retain its ID, mechanism, disposition, evidence and first-observation provenance after a guard lands; deleting the finding would hide why the control exists.

Maintain a concise root account of the current control and its limits. Keep distinct recurrence provenance and required historical qualifications in the directly linked task evidence owner; short evidence and immutable approval receipts may remain in the root record. The root remains the sole owner of IDs, cumulative counts, dispositions and first observations. Add new information to that account instead of appending session narration, repeated policy explanations or debugging diaries. Condense repeated examples without reducing the count, erasing a distinct failure variant, discarding the sole evidence for a claim or presenting a partial guard as complete. Current semantics, status and cost stay in their linked owners.
