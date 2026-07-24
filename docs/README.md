# Documentation

This is the sole documentation registry for the project. It identifies the purpose and owner of each maintained document.

## Fast navigation

| Task | Read |
|---|---|
| Resume implementation | [PLAN.md](PLAN.md), [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), and the current gate in [TESTING.md](TESTING.md) |
| Run or inspect the CIB oracle | [TESTING.md](TESTING.md) and the [CIB runner guide](../runners/cibseven/README.md) |
| Run or inspect the Temporal adapter | [TESTING.md](TESTING.md), [TEMPORAL-EXECUTION-MODEL.md](TEMPORAL-EXECUTION-MODEL.md), and the [adapter guide](../packages/temporal-adapter/README.md) |
| Run or inspect BPMN XML ingestion | [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md), [TESTING.md](TESTING.md), and the [source package guide](../packages/bpmn-source/README.md) |
| Implement or review User Task interaction | [User Task interaction capsule](capsules/USER-TASK-INTERACTION.md), [TEMPORAL-EXECUTION-MODEL.md](TEMPORAL-EXECUTION-MODEL.md), and [TESTING.md](TESTING.md) |
| Run or inspect differential comparison | [TESTING.md](TESTING.md) and the [comparator guide](../packages/differential/README.md) |
| Understand assurance roles, Lean’s value, or MVP feasibility | [PROJECT-DESIGN.md](PROJECT-DESIGN.md), the [implementation map](IMPLEMENTATION-MAP.md), and the active [semantic capsule](capsules/README.md) |
| Change a shared wire format | [Shared wire contracts](../contracts/README.md), the applicable [semantic capsule](capsules/README.md), and [TESTING.md](TESTING.md) |
| Change project mission or semantic authority | [PROJECT-DESIGN.md](PROJECT-DESIGN.md) and [ARCHITECTURE-AND-ASSURANCE-HANDOFF.md](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) |
| Change BPMN import or semantic meaning | [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md) and the [research index](research/README.md) |
| Run or evaluate a bounded architecture spike | [experiments](experiments/README.md) |
| Inspect external source provenance | [SOURCES.md](SOURCES.md) |

## Registry

| Document | Audience and ownership |
|---|---|
| Top-level [README.md](../README.md) | New readers; concise purpose, honest status, quick start, and routes into this registry |
| [ARCHITECTURE-AND-ASSURANCE-HANDOFF.md](ARCHITECTURE-AND-ASSURANCE-HANDOFF.md) | Architecture and assurance contract supplied to the project; content preserved with trailing Markdown whitespace normalized |
| [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md) | Semantic contributors and stakeholders; exact OMG conformance goal, required normative clauses, and formalization risks |
| [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) | Contributors and owner; adopted exact parser dependency, source-preservation contract, security boundary, bounded CMOF use, license graph, and first implementation slice |
| [capsules/README.md](capsules/README.md) | Semantic contributors; registry and ownership boundary for project-authored semantic capsules |
| [capsules/USER-TASK-INTERACTION.md](capsules/USER-TASK-INTERACTION.md) | Semantic contributors; evidence-closed draft task identity, projection, exact completion admission, witnesses, laws, closure interpretation, and exclusions |
| [TEMPORAL-EXECUTION-MODEL.md](TEMPORAL-EXECUTION-MODEL.md) | Adapter contributors and reviewers; Temporal replay, execution, messaging, failure, concurrency, versioning, and BPMN-boundary research |
| [TLA-AND-BISIMULATION-RESEARCH.md](TLA-AND-BISIMULATION-RESEARCH.md) | Semantic and adapter assurance contributors; question-driven formal-methods toolbox, behavioral relations, candidate experiments, and evidence limits |
| [REFERENCE-INSTRUMENTATION.md](REFERENCE-INSTRUMENTATION.md) | Researchers and performance contributors; pristine evidence lane, experimental source branches, execution profiles, acceleration limits, and shadow-equivalence gate |
| [research/README.md](research/README.md) | Researchers and semantic contributors; topic index and boundary between research input and approved decisions |
| [research/SEMANTIC-REPRESENTATIONS.md](research/SEMANTIC-REPRESENTATIONS.md) | Semantic architects; CIB Model API/PVM, fUML/PSSM execution models, code examples, and provisional source/IR/runtime consequences |
| [research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md](research/A12-KERNEL-LEAN-PROCESS-TRANSFER.md) | Semantic contributors; bounded transfer of Lean capsule, evidence, non-law, and specification-synchronization practices from the sibling experiment |
| [experiments/README.md](experiments/README.md) | Contributors running bounded risk spikes; experiment lifecycle, required evidence, and registry |
| [experiments/SEMANTIC-REPRESENTATION-SPIKES.md](experiments/SEMANTIC-REPRESENTATION-SPIKES.md) | Semantic architects; executable source/IR, scope, join-provenance, and command-closure discriminators |
| [experiments/BPMN-XML-INGESTION-SPIKE.md](experiments/BPMN-XML-INGESTION-SPIKE.md) | Import contributors; read-only published-parser probe against the current fixture and 21 MIWG reference models |
| [PROJECT-DESIGN.md](PROJECT-DESIGN.md) | Contributors and stakeholders; durable mission, authority and assurance roles, Lean value and limits, interpreter architecture, MVP feasibility, initial boundary, and success criteria |
| [MILESTONE-0-FAST-PIPELINE.md](MILESTONE-0-FAST-PIPELINE.md) | Contributors and resuming agents; durable walking-skeleton scope, runner contracts, performance budgets, work packages, and resume protocol |
| [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md) | Maintainers and reviewers; exact live implementation, proof, and evidence status |
| [PLAN.md](PLAN.md) | Resuming agents and owners; current checkpoint, candidate profile decisions, next steps, and stop conditions |
| [TESTING.md](TESTING.md) | Contributors; red/green workflow and verification gates |
| [SOURCES.md](SOURCES.md) | Researchers; provenance and controlled reference-checkout navigation |
| [reference/bpmn-2.0.2/README.md](reference/bpmn-2.0.2/README.md) | Researchers; local BPMN 2.0.2 corpus, conversion QA, license boundary, and reproducibility hashes |
| [../contracts/README.md](../contracts/README.md) | Cross-language contributors; language-neutral schema ownership and independent version dimensions |
| [../CLAUDE.md](../CLAUDE.md) | Contributors and agents; mandatory repository workflow and architecture boundaries |

The [profile artifact root](../profiles/README.md) and [scenario artifact root](../scenarios/README.md) explain artifact lifecycle, the draft profile boundary, and the calibrated neutral scenario.

When a fact is useful elsewhere, link to its owner and add only the local consequence. Exact current status belongs in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md), immediate sequencing in [PLAN.md](PLAN.md), durable project boundaries in [PROJECT-DESIGN.md](PROJECT-DESIGN.md), and provenance in [SOURCES.md](SOURCES.md).

## Placement rules

- Put stable mission, authority, and approved boundaries in [PROJECT-DESIGN.md](PROJECT-DESIGN.md).
- Put bounded project-owned semantic meaning, laws, witnesses, and exclusions under [capsules](capsules/README.md).
- Put external-system and semantic-background analysis under [research](research/README.md).
- Put bounded executable questions, red/green evidence, and provisional outcomes under [experiments](experiments/README.md).
- Put exact implemented, proved, tested, and absent surfaces in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).
- Put only the current checkpoint, ordered next work, unresolved decisions, and resume point in [PLAN.md](PLAN.md).
- Put source revisions, licenses, and controlled checkout navigation in [SOURCES.md](SOURCES.md).
- Link to the owning document instead of copying its live inventory.
