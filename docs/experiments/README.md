# Experiments

Experiments are bounded learning instruments for representation or semantic risks that are expensive to correct after the pipeline grows. They do not become architecture decisions merely because code compiles or one witness passes.

Every experiment must record:

- the question and competing accounts;
- a source-grounded separating witness;
- scope, exclusions, and non-claims;
- executable location and focused command;
- red/green evidence;
- result and confidence;
- what remains undecided;
- the next discriminator or explicit stop condition.

An experiment ends in one of three states:

1. a closed semantic capsule adopted through the normal profile and evidence process;
2. a precise unresolved boundary, with provisional code retained only when it remains a useful executable discriminator;
3. a representation correction followed by re-audit of affected semantics, proofs, serializers, and adapters.

Keep experiments out of the default semantic authority until they are adopted. Prefer data-only candidates, deliberate countermodels, tiny witnesses, and dedicated gates. Do not add a dependency merely to make an experiment convenient.

## Registry

| Experiment | State | Focused gate |
|---|---|---|
| [Private Core Query eviction correction](../research/TEMPORAL-EXECUTION-RESEARCH.md#private-core-correction-and-usage-check) | Bounded SDK defect corrected and validated; [private patch](temporal-query-eviction-core/core.patch) retained, production adoption open | Isolated Core library unit suite and SDK 1.21.0 live Query comparison; exact commands and receipts in the investigation |
| [Private Core Query clock correction](../research/TEMPORAL-EXECUTION-RESEARCH.md#legacy-query-pending-input-clock-investigation) | Demonstrated SDK input/clock defect; reviewed [clock patch](temporal-query-eviction-core/query-clock.patch) and diagnostic listings retained, production adoption open | Core parser/Worker red-green guards, complete library suite, minimal live/cold witness and unchanged functional product checks; local performance deferred |
| [Private Node runtime corrections](../research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#2026-10-01-corrected-build-validation) | V8 prologue backport and Node async-stack correction validated in private Node `24.18.0` builds; [upstream V8 patch](node-runtime-corrections/v8-0b94a9fd.patch) and [Node patch](node-runtime-corrections/node-contextify-async-stack.patch) retained, with [diagnostic sources](../research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md#retained-diagnostic-sources); runtime adoption open | LLDB-injected V8 witness and `node --test` reproducer against the private executables; product gates in the investigation |
| [Internal commutation proof architecture](INTERNAL-COMMUTATION-PROOF-ARCHITECTURE-EXPERIMENT.md) | Closed; corrected external review, countermodels, and two measured replacements retained; neither adopted | Historical isolated `./scripts/lake.sh build` under 3 GiB; exact alternative patches and measurements linked in the report |
| [Semantic representation experiment](SEMANTIC-REPRESENTATION-EXPERIMENT.md) | Executed; provisional candidates retained | `./scripts/lake.sh exe checkSemanticRepresentationSpike` |
| [BPMN XML ingestion experiment](BPMN-XML-INGESTION-EXPERIMENT.md) | Closed; bounded source boundary adopted | `./scripts/pnpm.sh run test:bpmn-source` and optional `test:miwg` |
| [Temporal production-lifecycle experiment](TEMPORAL-PRODUCTION-LIFECYCLE-EXPERIMENT.md) | Executed and resolved; selected account graduated to the lifecycle specification | `./scripts/pnpm.sh run test:temporal` |
| [Checked-source relation experiment](CHECKED-SOURCE-RELATION-EXPERIMENT.md) | Executed; unresolved at the effort boundary; provisional discriminator retained | `./scripts/lake.sh exe checkCheckedSourceRelationExperiment` |
| [Compensation retention experiment](COMPENSATION-RETENTION-EXPERIMENT.md) | Executed and corrected; hidden-state feasibility and the 64 KiB budget are established, while explicit handler eligibility and boundary-handler/Event-Sub-Process separation replace the original scope-wide inference | None retained; the normative half cites the pinned corpus and the cost half is a recorded measurement |
