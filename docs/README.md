# Documentation

This is the sole documentation registry for the project. It identifies the purpose and owner of each maintained document.

## Fast navigation

| Task | Read |
|---|---|
| Add, rename, graduate, archive, or classify a document | [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md) |
| Understand the implemented MVP end to end | [MVP-WALKTHROUGH.md](MVP-WALKTHROUGH.md) |
| Resume implementation | [PLAN.md](PLAN.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and the current gate in [TESTING-SPEC.md](TESTING-SPEC.md) |
| Run or inspect the CIB oracle | [TESTING-SPEC.md](TESTING-SPEC.md) and the [CIB runner guide](../runners/cibseven/README.md) |
| Run or inspect the Temporal adapter | [TESTING-SPEC.md](TESTING-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md), and the [adapter guide](../packages/temporal-adapter/README.md) |
| Run or inspect BPMN XML ingestion | [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md), [TESTING-SPEC.md](TESTING-SPEC.md), and the [source package guide](../packages/bpmn-source/README.md) |
| Implement or review User Task interaction | [User Task interaction capsule](capsules/USER-TASK-INTERACTION-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md), and [TESTING-SPEC.md](TESTING-SPEC.md) |
| Implement or review Intermediate Catch Timer behavior | [Intermediate Catch Timer spec](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md), and [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md) |
| Decide CIB Seven extension and replacement-API scope | [CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md), [CIB Seven extension research](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md), [CIB–BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md), and [PLAN.md](PLAN.md) |
| Inspect the A12 Workflows replacement denominator and compatibility priorities | [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md), [PROJECT-DESIGN.md](PROJECT-DESIGN.md), [CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md), and [SOURCES.md](SOURCES.md) |
| Implement or review Service Task effect behavior | [CIB Seven compatibility scope proposal](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md), [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md), and [TESTING-SPEC.md](TESTING-SPEC.md) |
| Decide typed BPMN Error and interrupting boundary-error behavior | [Typed BPMN Error and boundary-error proposal](capsules/BOUNDARY-ERROR-PROPOSAL.md), [A12 Workflows compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md), [CIB–BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md), and [PLAN.md](PLAN.md) |
| Review the semantic-core runtime-language boundary | [Dual semantic-core architecture proposal](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md), [PROJECT-DESIGN.md](PROJECT-DESIGN.md), [Semantic Process IL specification](SEMANTIC-PROCESS-IL-SPEC.md), and [PLAN.md](PLAN.md) |
| Review or change the production Temporal lifecycle | [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [the lifecycle experiment](experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md), [TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md), and [PLAN.md](PLAN.md) |
| Implement or review the Semantic Process IL and parallel fork/join contracts | [SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md), [parallel fork/join spec](capsules/PARALLEL-FORK-JOIN-SPEC.md), [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md), and [PLAN.md](PLAN.md) |
| Run or inspect differential comparison | [TESTING-SPEC.md](TESTING-SPEC.md) and the [comparator guide](../packages/differential/README.md) |
| Understand assurance roles, Lean’s value, or MVP feasibility | [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the [implementation map](IMPLEMENTATION-MAP.md), and the active [semantic capsule](capsules/README.md) |
| Change a shared wire format | [Shared wire contracts](../contracts/README.md), the applicable [semantic capsule](capsules/README.md), and [TESTING-SPEC.md](TESTING-SPEC.md) |
| Change project mission or semantic authority | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) and [ARCHITECTURE-AND-ASSURANCE-HANDOFF.md](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) |
| Classify CIB behavior relative to BPMN | [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md), the applicable [semantic capsule](capsules/README.md), and [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md) |
| Change BPMN import or semantic meaning | [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md), [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md), and the [research index](research/README.md) |
| Inspect BPMN requirement dispositions | [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md), [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md), and the applicable [semantic capsule](capsules/README.md) |
| Run or evaluate a bounded architecture spike | [experiments](experiments/README.md) |
| Inspect external source provenance | [SOURCES.md](SOURCES.md) |

## Registry

| Document | Audience and ownership |
|---|---|
| Top-level [README.md](../README.md) | New readers; durable purpose, architecture, quick start, and routes to the live implementation map and plan |
| [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md) | Contributors and agents; filename-role contracts, spec/proposal lifecycle, document homes, same-change triggers, and archive rules aligned with `a12-rulekit` |
| [MVP-WALKTHROUGH.md](MVP-WALKTHROUGH.md) | New readers and reviewers; source-synchronized tour through exact BPMN input, executable IR, CIB, Lean, the semantic core, Temporal, comparison, mutation, and replay |
| [ARCHITECTURE-AND-ASSURANCE-HANDOFF.md](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) | Architecture and assurance contract supplied to the project; content preserved with trailing Markdown whitespace normalized |
| [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md) | Semantic contributors and stakeholders; exact OMG conformance goal, required normative clauses, and formalization risks |
| [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md) | Semantic contributors and stakeholders; reviewed BPMN Process Execution requirements, dispositions, owners, and evidence links without duplicating implementation inventory |
| [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md) | Semantic contributors and stakeholders; prominent central register for CIB normative agreement, gap resolutions, extensions, configuration-specific behavior, limitations, and candidate or confirmed deviations |
| [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) | Contributors and owner; adopted exact parser dependency, source-preservation contract, security boundary, bounded CMOF use, license graph, and first implementation slice |
| [CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) | Owner and architecture contributors; compatibility-level target and dispositions for Camunda/CIB Seven extensions, handlers, Java delegates, expressions, scripts, FEEL, and external tasks |
| [DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md](DUAL-SEMANTIC-CORE-ARCHITECTURE-PROPOSAL.md) | Owner and architecture reviewers; competing runtime-language accounts, independent-transcription boundary, JVM-consumer test, bounded Java experiment, and permanent-adoption conditions |
| [SEMANTIC-PROCESS-IL-SPEC.md](SEMANTIC-PROCESS-IL-SPEC.md) | Semantic, source, and adapter contributors; implemented draft checked BPMN graph and bounded Semantic Process IL contract, including lowering rules, operational semantics, exact Lean proof boundary, growth policy, and stop criteria |
| [capsules/README.md](capsules/README.md) | Semantic contributors; registry and ownership boundary for project-authored semantic capsules |
| [capsules/USER-TASK-INTERACTION-SPEC.md](capsules/USER-TASK-INTERACTION-SPEC.md) | Semantic contributors; evidence-closed draft task identity, projection, exact completion admission, witnesses, laws, closure interpretation, and exclusions |
| [capsules/PARALLEL-FORK-JOIN-SPEC.md](capsules/PARALLEL-FORK-JOIN-SPEC.md) | Owner and semantic contributors; evidence-closed draft observable contract, rule-to-evidence matrix, assurance boundary, candidate CIB deviation, representation decision, and exclusions for the parallel slice |
| [capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md](capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md) | Owner and semantic contributors; evidence-closed draft `PT1S` Intermediate Catch Timer meaning, source/IL/runtime contract, cross-target firing contract, controlled-clock CIB evidence, and durable Temporal wakeup refinement |
| [capsules/SERVICE-TASK-EFFECT-SPEC.md](capsules/SERVICE-TASK-EFFECT-SPEC.md) | Owner and semantic contributors; implemented exact-source, effect-intent, idempotency, CIB retry, Temporal Activity, reconciliation, and evidence contract for one Service Task |
| [capsules/CREATE-DOCUMENT-DATA-SPEC.md](capsules/CREATE-DOCUMENT-DATA-SPEC.md) | Owner and semantic contributors; approved A12-shaped `CreateDocument` string-variable, mapping, effect-patch, unchanged-source, and success-only transaction-refinement contract |
| [capsules/BOUNDARY-ERROR-PROPOSAL.md](capsules/BOUNDARY-ERROR-PROPOSAL.md) | Owner and semantic contributors; proposed exact-code typed business-error result, interrupting boundary route, synchronous CIB Seven `2.0.0` host relation, Temporal refinement, phase-zero probe, and exclusions |
| [research/TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md) | Adapter contributors and reviewers; Temporal replay, execution, messaging, failure, concurrency, versioning, and BPMN-boundary research |
| [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) | Adapter contributors and reviewers; implemented semantic-lifetime Workflow, collision-resistant Process addressing, content-bound Update identity, retention-bounded result recovery, typed post-closure outcomes, evidence contract, and exclusions |
| [research/TLA-AND-BISIMULATION-RESEARCH.md](research/TLA-AND-BISIMULATION-RESEARCH.md) | Semantic and adapter assurance contributors; question-driven formal-methods toolbox, behavioral relations, candidate experiments, and evidence limits |
| [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md) | Researchers and performance contributors; pristine evidence lane, experimental source branches, execution profiles, acceleration limits, and shadow-equivalence gate |
| [research/README.md](research/README.md) | Researchers and semantic contributors; topic index and boundary between research input and approved decisions |
| [research/SEMANTIC-REPRESENTATIONS-RESEARCH.md](research/SEMANTIC-REPRESENTATIONS-RESEARCH.md) | Semantic architects; CIB Model API/PVM, fUML/PSSM execution models, code examples, and provisional source/IR/runtime consequences |
| [research/WEBASSEMBLY-SEMANTICS-RESEARCH.md](research/WEBASSEMBLY-SEMANTICS-RESEARCH.md) | Semantic architects; WebAssembly declarative rules, reference interpreters, SpecTec and experimental proof backends, portable conformance tests, proof boundary, and bounded transfer recommendations |
| [research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md](research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md) | Semantic contributors; bounded transfer of Lean capsule, evidence, non-law, and specification-synchronization practices from the sibling experiment |
| [research/CIB-SEVEN-EXTENSIONS-RESEARCH.md](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md) | Architecture and compatibility contributors; pinned-source family inventory and claim boundaries for the Camunda namespace, execution bindings, Java delegates and beans, expressions, scripts, FEEL, and external tasks |
| [research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) | Product, architecture, and compatibility contributors; defined A12 Workflows `release/2025.06` BPMN, extension, delegate, API, and downstream-blueprint denominator with target-backed priorities |
| [research/CIB-SEVEN-A12-BASELINE-RESEARCH.md](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) | Product and compatibility contributors; bounded CIB Seven `2.0.0`/`2.2.0` comparison for the A12 `CreateDocument` execution seam and the broader non-equivalence boundary |
| [experiments/README.md](experiments/README.md) | Contributors running bounded risk spikes; experiment lifecycle, required evidence, and registry |
| [experiments/SEMANTIC-REPRESENTATION-EXPERIMENT.md](experiments/SEMANTIC-REPRESENTATION-EXPERIMENT.md) | Semantic architects; executable source/IR, scope, join-provenance, and command-closure discriminators |
| [experiments/BPMN-XML-INGESTION-EXPERIMENT.md](experiments/BPMN-XML-INGESTION-EXPERIMENT.md) | Import contributors; read-only published-parser probe against the current fixture and 21 MIWG reference models |
| [experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md](experiments/TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md) | Adapter contributors and owner; executable Worker-restart, retained-Update-result, closed-command, Workflow-ID-reuse, replay, and identity-separation discriminator |
| [experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md](experiments/CHECKED-SOURCE-RELATION-EXPERIMENT.md) | Semantic architects and owner; direct checked-graph token-game account, fixture-coincidental positional-lowering discriminator, and precise unresolved correspondence boundary |
| [PROJECT-DESIGN.md](PROJECT-DESIGN.md) | Contributors and stakeholders; durable mission, authority and assurance roles, Lean value and limits, interpreter architecture, pre-release evolution policy, MVP feasibility, and capsule success criteria |
| [archived/MILESTONE-0-FAST-PIPELINE-PROPOSAL.md](archived/MILESTONE-0-FAST-PIPELINE-PROPOSAL.md) | Archived first walking-skeleton proposal; historical scope, contracts, budgets, work packages, and decisions whose current consequences live elsewhere |
| [archived/README.md](archived/README.md) | Contributors and researchers; registry and authority boundary for resolved, superseded, or parked documentation |
| [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) | Maintainers and reviewers; exact live implementation, proof, and evidence status |
| [PLAN.md](PLAN.md) | Resuming agents and owners; current checkpoint, approved implementation sequence, next steps, and stop conditions |
| [TESTING-SPEC.md](TESTING-SPEC.md) | Contributors; red/green workflow and verification gates |
| [SOURCES.md](SOURCES.md) | Researchers; provenance and controlled reference-checkout navigation |
| [reference/bpmn-2.0.2/README.md](reference/bpmn-2.0.2/README.md) | Researchers; local BPMN 2.0.2 corpus, conversion QA, license boundary, and reproducibility hashes |
| [../contracts/README.md](../contracts/README.md) | Cross-language contributors; current language-neutral schemas, artifact roles, content identity, and pre-release evolution policy |
| [../CLAUDE.md](../CLAUDE.md) | Contributors and agents; mandatory repository workflow and architecture boundaries |

The [profile artifact root](../profiles/README.md) and [scenario artifact root](../scenarios/README.md) explain artifact lifecycle, the draft profile boundary, and the calibrated neutral scenario.

When a fact is useful elsewhere, link to its owner and add only the local consequence. Exact current status belongs in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](PLAN.md), durable project boundaries in [PROJECT-DESIGN.md](PROJECT-DESIGN.md), and provenance in [SOURCES.md](SOURCES.md).

## Placement rules

- Apply [DOC-DISCIPLINE.md](DOC-DISCIPLINE.md) before adding, naming, graduating, moving, archiving, or deleting a document.
- Put stable mission, authority, and approved boundaries in [PROJECT-DESIGN.md](PROJECT-DESIGN.md).
- Put reviewed BPMN Process Execution requirement dispositions in [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md).
- Put every reviewed CIB agreement, operational detail, interpretation, extension, configuration dependency, limitation, or deviation relative to BPMN in [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md).
- Put bounded project-owned semantic meaning, laws, witnesses, and exclusions under [capsules](capsules/README.md).
- Put external-system and semantic-background analysis under [research](research/README.md).
- Put bounded executable questions, red/green evidence, and provisional outcomes under [experiments](experiments/README.md).
- Put exact implemented, proved, tested, and absent surfaces in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).
- Put only the current checkpoint, ordered next work, unresolved decisions, and resume point in [PLAN.md](PLAN.md).
- Put source revisions, licenses, and controlled checkout navigation in [SOURCES.md](SOURCES.md).
- Link to the owning document instead of copying its live inventory.
