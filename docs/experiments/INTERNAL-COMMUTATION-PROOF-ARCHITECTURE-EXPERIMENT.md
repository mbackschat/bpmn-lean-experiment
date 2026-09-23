# Internal commutation proof architecture assessment

## Status

Closed by owner direction on 2026-09-23. Neither experimental replacement is adopted. This closes the architecture investigation, not the [Internal Commutation proposal](../INTERNAL-COMMUTATION-PROPOSAL.md), its unfinished bounded-entry outcome, or an MUE RC obligation. No further experiment or correction-review round is scheduled.

This is the consolidated, corrected record of the owner-supplied external review and the subsequent experiments against immutable baseline `2a12990b416e5327d19d37440a95e556d3642c02`. It is not a verbatim transcript or a new semantic authority. The external reviewer audited the census replacement and proposed the execution experiment; the execution result below is the author's measured result, not an independently approved production change.

## Question and preserved contract

Can the existing proofs reveal a reusable preparation/execution interface that substantially reduces the regional reader × writer matrix, without changing native preparation, acceptance, or public theorem types?

The [owning contract](../INTERNAL-COMMUTATION-PROPOSAL.md#checkpoint-execution-and-publication-contract) requires both preparation directions, exact canonical successor equality, successor validity/projectability, and actual accepted publication after canonical ordering and numbering. Token multiplicity, historical references, raw-Program validity, identity namespaces, and whole-command rollback remain material. A sequential fallback, stronger validity predicate, conservative new batching refusal, or equality only after observation would change that contract. None was adopted.

The finite-batch permutation theorem already supplies finite composition. The experiment concerns the preparation and execution obligations supplied by families, not a new runtime conflict checker or another preparation compiler.

## Growth and mechanism

Counts are nonblank physical source lines including comments, measured at the baseline. They measure maintained source, not productivity or wasted effort.

| Scope | Before commutation, `7566a605` | Baseline |
|---|---:|---:|
| `SemanticProcess/Internal*` modules | 0 | 272 |
| Their nonblank lines | 0 | 54,072 |
| Active Lean nonblank lines, excluding the frozen `adoption/a12/legacy/source-tree/` snapshot | 35,491 | 136,388 |

Other work contributed to total Lean growth. The reviewer's heuristic module-name classification counted 15,709 clearly pair-shaped lines, of which 11,794 involved Regional, plus 5,363 mixed frame/retention lines. These are candidate costs, not verified removable code. Of 28 unordered cross-family combinations among eight families, 21 were integrated; six bounded-entry combinations had core pair results without complete publication/integration, and bounded entry × Regional remained partial. This is proof coverage, not profile reachability.

Regional preparation combines global validity/projectability guards, ownership traversal, historical-reference retention, singleton/absence censuses, and publication construction. Writers repeatedly establish preservation of those components. Pair execution and publication add another matrix. Naming the repeated premises a relation or certificate does not reduce that work unless native writers can discharge it once, independently of the reader. Family × invariant-conjunct preservation remains a separate cost.

The review's initial estimates of thousands of removable lines were hypotheses. Neither completed deletion experiment establishes those savings or eliminates quadratic future work. The evidence also does not prove that a better representation is impossible.

## Corrected findings and discriminators

| Candidate or question | Result | Exact limit |
|---|---|---|
| Abstract effect algebra and indexed TypeScript checker | Abstract laws and restricted native-successor probes passed | No production refinement; acceptance, Lean token multiplicity, and canonical-order instances did not match the full contract. Do not adopt a second Plan/index/compiler/checker. |
| Graph exactness | General `runtimeStateWellFormed → scopeOwnershipGraphExact` theorem proved in the experiment | Useful isolated result, not a complete read frame or an adopted production lemma. |
| Symmetric regional read frame | Return/local-data countermodels refute it | Valid/projectable endpoints and unchanged declared observations can accompany strictly improved readiness. `RuntimeStateMonotone` alone does not make the relation directed. |
| Blanket insertion non-aliasing | Timer-task insertion can legally resolve an orphan historical Activity-local reference | Refutes the proposed sufficient interface, not the existing accepted pair theorem. Strengthening validity would require a separate semantic decision. |
| Directed census | One selector unfolding replaces three writer-shape unfoldings | Selection only; closure, region, execution, and publication are not thereby proved. |
| Publication locality | A region-relevant ordered view plus explicit handler-query equality supports local-control and Merge corollaries | Not yet discharged through a complete abstract writer interface. |
| Handler locality | Timer-attachment and body keys work where whole owner populations are too coarse; scope creation and bounded entry instantiate certificates | Diagnostic integrations retain old pair-specific region/separation/classifier facts. They do not close bounded entry × Regional. |
| Native execution square | Regional × Regional uses a common filter square with unchanged complete public types | Net saving misses the agreed gate; Regional × Arming still uses its old proof. |

The accepted census growth condition is essential to interpreting the experiment: a new reader census must reuse an existing key family or use a declared atom. Inventing one key per reader merely renames the matrix. Return's key preserves a selected singleton; scope identity, parented-definition, and parentless-pid keys preserve general occupied populations. The Call certificate takes predecessor projectability independently of a reader, but its experimental call site still obtains that fact from the reader's publication template.

Handler references must resolve by live-work validity; historical local-data references need not. The native [Activity cancellation factorization](../../BpmnSemantics/SemanticProcess/InternalRegionalActivityRemoval.lean) already supplies `regional_activity_record_mask` and `regional_withdrawn_activities_eq`; it should not be re-proved. The retained [identity regressions](../../BpmnSemantics/BoundedScopeActivityIdentityConformance.lean) distinguish definition-scope IDs from BPMN element IDs. The separate raw-Program ambiguity refusal cannot be discarded by assuming checked-graph uniqueness for every raw Program.

## Measured replacements

Both patches are independent alternatives against the same baseline, not cumulative changes. Native selectors, footprints, runtime definitions, dispatch, TypeScript, and fixtures are unchanged. The retained [measurement records](internal-commutation-proof-architecture/results.json) include exact changed-source counts and hashes.

| Experiment | Baseline lines | Candidate lines | Net reduction | Disposition |
|---|---:|---:|---:|---|
| [Census replacement](internal-commutation-proof-architecture/census.patch) | 653 | 656 | −3 | Do not adopt on its own |
| [Execution square](internal-commutation-proof-architecture/execution.patch) | 883 | 798 | 85 | Stop: required reduction was at least 300 |

The census candidate changes three existing modules and adds a fourth, retiring no module. It adds nine public names: `Occupied`, `CensusStep`, `occupied_singleton`, `occupied_retained`, `regionalSelection_census_frame`, `occupied_filter`, `census_filter`, `call_element_fresh`, and `scopeCreation_censuses`. The `rootCompletion`, `inputs`, `quiet`, and `withdrawal` obligations still need writer-shape discharges. Twelve complete elaborated theorem types remain byte-identical, digest `16c0944e2c9af58a4f993d48af7ea5ae6c40f52a849c1b59884b9f553d383aea`. The external reviewer verified the source comparison, lack of hidden superseded-proof dependence, types, and measurement, and recommended against census-only adoption.

The execution candidate changes `InternalRegionalPairCommutation` from 671 to 254 lines, adds 332 lines in `InternalRegionalMaskSquare`, and leaves the 212-line `InternalRegionalArmingCommutation` unchanged. The new module includes 67 lines of native ordinary/data-arming insertion algebra whose premises are not discharged by the new consumer. Removing that exploration gives a completed Regional × Regional slice saving 152 lines. Twelve private declarations disappear, but six private scaffolding/token/adapter names remain; the criterion to retire every private declaration was not met.

Even deleting the remaining 180 private arming lines at zero additional cost would save only 265 lines with this candidate. That candidate-dependent bound triggered the stop; Stage 2 did not begin. A 112-line dependency outside the frozen deletion pool remains physically present and is not counted. Six complete elaborated types, including the pair, pair-publication, arming pair, transition pair, batch permutation, and canonical publication permutation theorems, remain identical, digest `e81676bdf83eadc24eaaf650ce1c35d8d94442df000dfa729a392758f6c114ae`.

## Verification and resource limits

The command was `./scripts/lake.sh build`: a full Lean library build, not the complete repository verifier. Both candidates passed under Lean 4.31.0, one CPU/thread, a 3,221,225,472-byte cgroup bound, and no additional swap, with warm unaffected dependencies. The final proof audits report standard axioms only. Repository infrastructure guards were not run on either candidate; they would be required before adoption.

| Run | Elapsed seconds | User + system CPU seconds | Maximum RSS KiB | Cgroup peak bytes |
|---|---:|---:|---:|---:|
| Census matched baseline | 112.78 | 87.99 + 10.84 | 2,030,500 | 1,911,808,000 |
| Census matched replacement | 108.88 | 85.03 + 10.00 | 2,004,976 | 1,911,496,704 |
| Execution candidate | 59.35 | 53.83 + 2.15 | 2,030,840 | 1,953,951,744 |

The census pair invalidated the same 58 baseline modules and the replacement's new module in separate copied caches. One sequential pair does not establish a reliable speedup. The execution run has no paired timing control. Neither measurement is a cold-machine memory or speed claim. Final runs had no OOM or memory-max event; the census comparison recorded small memory-pressure totals.

## Evidence retention and reproduction boundary

The project retains the two exact patches, changed-source hashes/counts, and measurement records so inspecting or reconstructing either candidate does not depend on an ignored checkout. Apply each separately to a disposable source extraction of `git archive 2a12990b416e5327d19d37440a95e556d3642c02`, using `git apply --check` before `git apply`, then compare the changed files to the recorded hashes. This is a source extraction, not a new Git worktree. Do not apply either patch to production. A fresh execution must follow the repository's [Lean resource policy](../CAPSULE-COST-LEDGER.md#package-wide-theorem-elaboration-memory-correction); the recorded times are historical observations, not expected timings.

Full raw archives remain owner-held external evidence, not committed repository dependencies. They contain source snapshots, complete receipts, type outputs, axiom reports, and failed attempts; the portable subset here does not independently attest that those historical commands ran. Their immutable identifiers are:

| Archive | SHA-256 |
|---|---|
| `internal-commutation-census-deletion-20260923.tar.gz` | `af6b54edb4462f81326d5a33d5f15955765bd83bcdf46b14c8246cf61157c621` |
| `internal-commutation-execution-square-20260923.tar.gz` | `a009b605428bc41b06708b6bd70be627edb2563314c23f6bf1bf5e66c5a9e24b` |
| `internal-commutation-handler-locality-20260923.tar.gz` | `6fe1d1f903abdc17b1ba6a68bbecbdca3c7f90994db4a965ec3fc7ff66aa0165` |
| `internal-commutation-publication-locality-20260923.tar.gz` | `3ec0789995ff4f2ae8bfc0afd90b6b9d4402069b0c2ff4434c64ab2eee0e09a4` |
| `internal-commutation-directed-census-20260923.tar.gz` | `e30f874c1b08a0ce6aa20388f50dfc301c10137731f43bbabedd3a471f55f9d8` |
| `internal-commutation-directed-alias-20260923.tar.gz` | `b583ed4342df5ae1768244542b950a0eb559ddf0243271af932bd5f1b587aa9b` |
| `internal-commutation-regional-stage1-20260923.tar.gz` | `93352e7d5fa5d2dd7433af879839544d6606dc4448f5e5207bc35b6105dd15b9` |
| `internal-commutation-regional-review-probe-20260923.tar.gz` | `eb32ac6e67bbc00098147ec7a27c5276b9796a3cbf2c7cfe7da34f5463680b90` |
| `internal-commutation-experiments-20260923.tar.gz` | `6aeb0c9788013daf34557743d7581a647fffda78272b862585ff4515fb6d3174` |

## Decision and remaining uncertainty

Keep existing production proofs and the verified unfinished checkpoint. Do not adopt either patch, reopen the redesign, or resume exhaustive family-pair expansion on the strength of this review. The owner selected an [RC-focused scope amendment](../INTERNAL-COMMUTATION-PROPOSAL.md#rc-completion-scope-amendment) through the existing proposal and review process; [PLAN](../PLAN.md#exact-resume-point) owns execution order.

A complete directed preparation interface, generic accepted-publication composition, bidirectional reader/writer instances, and a bounded-entry extension with zero new pair modules remain unproved. No linear-growth result or thousands-of-lines saving is claimed. Those uncertainties do not invalidate the existing proofs, and closing the investigation does not accept incomplete outcomes. The separately pending regional workflow trial remains pending.
