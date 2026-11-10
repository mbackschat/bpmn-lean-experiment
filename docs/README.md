# Documentation

The sole documentation registry. Every maintained document under `docs/` is listed here once with its audience and what it owns; a document that is added, renamed or deleted updates this registry and every inbound link in the same change ([documentation rules](kernel/ENGINEERING-POLICY.md#documentation)).

## Fast navigation

| Task | Read |
|---|---|
| Resume work, see the delivery order and the next action | [PLAN.md](PLAN.md#exact-resume-point) |
| Change the kernel's design, a guardrail or the build shape | [kernel architecture](kernel/ARCHITECTURE-SPEC.md) |
| Work on a coverage row | its row in the [coverage target](PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the [row traceability map](kernel/ROW-TRACEABILITY-MAP.md), the [kernel status map](kernel/KERNEL-STATUS-MAP.md) and the semantics document of its feature |
| Change what a BPMN construct means, or a CIB relation | the [semantics documents](#kernel), the [CIB–BPMN relation register](CIB-BPMN-RELATION-REGISTER.md) and the [requirement ledger](BPMN-REQUIREMENT-LEDGER.md) |
| Review, verify, write documentation or code, set up a machine | [engineering rules](kernel/ENGINEERING-POLICY.md) and the [contributor setup guide](CONTRIBUTOR-SETUP-GUIDE.md) |
| Change BPMN import or source preservation | [XML ingestion decision](BPMN-XML-INGESTION-DECISION.md), [interchange admission](INTERCHANGE-ADMISSION-SPEC.md), [preserve-only admission](PRESERVE-ONLY-ADMISSION-SPEC.md) |
| Change Temporal hosting | [Temporal lifecycle](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [Temporal defects ledger](TEMPORAL-DEFECTS-LEDGER.md) |
| Work on Product 2 | [BPM platform proposal](BPM-PLATFORM-PROPOSAL.md), [platform implementation map](BPM-PLATFORM-IMPLEMENTATION-MAP.md), [UI design specification](BPM-PLATFORM-UI-DESIGN-SPEC.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| Inspect external source provenance | [SOURCES.md](SOURCES.md) |

## Registry

### Plan and target

| Document | Audience and ownership |
|---|---|
| [PLAN.md](PLAN.md) | Resuming agents and the owner; delivery order, budgets, mechanism tracks and the exact resume point |
| [PRACTICAL-CIB7-COVERAGE-TARGET.md](PRACTICAL-CIB7-COVERAGE-TARGET.md) | Owner and contributors; the delivery target: per row its outcome with decisive acceptance, prerequisites and state |
| [PROJECT-DESIGN.md](PROJECT-DESIGN.md) | Contributors and stakeholders; mission, layering, authority and assurance roles, scope and milestones |
| [BPMN-CONFORMANCE-TARGET.md](BPMN-CONFORMANCE-TARGET.md) | Semantic contributors and stakeholders; the OMG conformance goal and the normative clauses it requires |
| [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md) | Semantic contributors and stakeholders; reviewed BPMN Process Execution requirements and their dispositions |
| [SHOWCASE-MILESTONE-LADDER-DECISION.md](SHOWCASE-MILESTONE-LADDER-DECISION.md) | Product and engine contributors; the adopted showcase milestone order and exit gates |
| [CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md](CIB-SEVEN-COMPATIBILITY-SCOPE-PROPOSAL.md) | Owner and architecture contributors; compatibility levels and dispositions for CIB Seven extensions, handlers, expressions, scripts, FEEL and external tasks |

### Kernel

| Document | Audience and ownership |
|---|---|
| [kernel/ARCHITECTURE-SPEC.md](kernel/ARCHITECTURE-SPEC.md) | Kernel contributors and reviewers; kernel design, contracts, Lean assurance lane, Temporal hosting, guardrails, review points and the definition of done for a row |
| [kernel/IL-SPEC.md](kernel/IL-SPEC.md) | Kernel and boundary contributors; the kernel IL wire shape and the refusal-by-field rule for forward-compatible restrictions |
| [kernel/ROW-TRACEABILITY-MAP.md](kernel/ROW-TRACEABILITY-MAP.md) | Kernel contributors and reviewers; guard 21 data mapping every coverage row onto the kernel shape, with the rule basis of each kernel rule |
| [kernel/KERNEL-STATUS-MAP.md](kernel/KERNEL-STATUS-MAP.md) | Owner, contributors and reviewers; per row what the kernel implements and what is absent, open proof lanes, assurance and adoption state |
| [kernel/ENGINEERING-POLICY.md](kernel/ENGINEERING-POLICY.md) | Contributors and agents; review, verification, documentation, code style and setup procedure |
| [kernel/semantics/FLOW-SEMANTICS-SPEC.md](kernel/semantics/FLOW-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Flow feature (sequence flow, gateways, Link events) |
| [kernel/semantics/DATA-SEMANTICS-SPEC.md](kernel/semantics/DATA-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Data feature (values, variables, mappings, expressions) |
| [kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md](kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; JUEL levels: which text is JUEL, grammar, evaluation, failure outcomes and admission refusals |
| [kernel/semantics/WORK-SEMANTICS-SPEC.md](kernel/semantics/WORK-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Work feature (tasks, effects, incidents, Call Activities) |
| [kernel/semantics/SCRIPT-SEMANTICS-SPEC.md](kernel/semantics/SCRIPT-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; interpretation of JavaScript Script Tasks as recorded host effects (PC-AUTO-05), awaiting its cold review |
| [kernel/semantics/DECISION-SEMANTICS-SPEC.md](kernel/semantics/DECISION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; interpretation of DMN decision tables behind Business Rule Tasks (PC-AUTO-07), awaiting its cold review |
| [kernel/semantics/SCOPES-SEMANTICS-SPEC.md](kernel/semantics/SCOPES-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Scopes feature (Sub-Processes, Event Sub-Processes, Transactions) |
| [kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md](kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Subscriptions feature (Timer, Message, Signal, Conditional catches and boundaries) |
| [kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md](kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of throws and their propagation (Error, Escalation, Terminate) |
| [kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md](kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of the Multi-Instance feature |
| [kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md](kernel/semantics/COMPENSATION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; meaning, CIB relations and restrictions of Compensation and Transaction cancellation |
| [kernel/semantics/ADMISSION-SEMANTICS-SPEC.md](kernel/semantics/ADMISSION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; admission rules, refusal codes and the reviewed admitted surface |
| [kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md](kernel/semantics/PUBLICATION-AND-OBSERVATION-SEMANTICS-SPEC.md) | Semantic, host and platform contributors; outcomes, journal, occurrence and publication contracts the kernel emits |
| [kernel/semantics/POPULATION-SEMANTICS-SPEC.md](kernel/semantics/POPULATION-SEMANTICS-SPEC.md) | Semantic contributors and reviewers; cross-instance start selection, correlation, broadcast and called-definition binding |

### Semantic authority and CIB

| Document | Audience and ownership |
|---|---|
| [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md) | Semantic contributors and stakeholders; every reviewed CIB agreement, interpretation, extension, configuration dependency, limitation and deviation relative to BPMN |
| [CIB-OBSERVATION-POLICY.md](CIB-OBSERVATION-POLICY.md) | CIB runner and differential contributors; field-by-field fidelity of CIB observations |
| [JUEL-EVALUATION-ARCHITECTURE-DECISION.md](JUEL-EVALUATION-ARCHITECTURE-DECISION.md) | Semantic and compatibility contributors; the JUEL evaluation decision as amended for the kernel's read-only subset |
| [SIMPLE-BOOLEAN-EXPRESSION-DECISION.md](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) | Semantic and source contributors; the dependency-free Simple Boolean `FormalExpression` language, its grammar and truth semantics |
| [REFERENCE-INSTRUMENTATION-POLICY.md](REFERENCE-INSTRUMENTATION-POLICY.md) | Researchers; pristine evidence lane, experimental source branches and the shadow-equivalence gate |

### Source admission

| Document | Audience and ownership |
|---|---|
| [BPMN-XML-INGESTION-DECISION.md](BPMN-XML-INGESTION-DECISION.md) | Source contributors and owner; the adopted parser dependency, source-preservation contract, security boundary and license graph |
| [INTERCHANGE-ADMISSION-SPEC.md](INTERCHANGE-ADMISSION-SPEC.md) | Source and semantic contributors; standard preserved notation composed with executable models |
| [PRESERVE-ONLY-ADMISSION-SPEC.md](PRESERVE-ONLY-ADMISSION-SPEC.md) | Source contributors and owner; the execute, preserve and reject partition of BPMN elements |

### Temporal hosting

| Document | Audience and ownership |
|---|---|
| [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](TEMPORAL-PROCESS-LIFECYCLE-SPEC.md) | Host contributors and reviewers; semantic-lifetime Workflow, Process addressing, Update identity, result recovery and post-closure outcomes |
| [RUNNABLE-TEMPORAL-MVP-SPEC.md](RUNNABLE-TEMPORAL-MVP-SPEC.md) | Product users and host contributors; the engine-runner contract, interaction driver, pre-start gates and exit classifications |
| [TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md](TEMPORAL-WORKER-DEPLOYMENT-REPAIR-SPEC.md) | Host contributors; immutable Worker routing and retained-Run Query isolation |
| [TEMPORAL-DEFECTS-LEDGER.md](TEMPORAL-DEFECTS-LEDGER.md) | Contributors; stable runtime-defect IDs, attribution, impact, project disposition and closure evidence |
| [TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md](TEMPORAL-BPMN-EXECUTION-SCALABILITY-PROPOSAL.md) | Product, platform and host contributors; scale assessment and post-MVP roadmap, outside the current target |

### Product 2 platform

| Document | Audience and ownership |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Platform and engine contributors; repository layout, module ownership, dependency direction, deployment composition and the frontend recommendation preflight |
| [BPM-PLATFORM-PROPOSAL.md](BPM-PLATFORM-PROPOSAL.md) | Platform contributors and owner; Product 2's contract, engine boundary, surfaces, stack and exclusions |
| [BPM-PLATFORM-IMPLEMENTATION-MAP.md](BPM-PLATFORM-IMPLEMENTATION-MAP.md) | Product 2 contributors; modules, persistence, HTTP, UI, deployment, browser evidence and platform exclusions |
| [BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md](BPM-PLATFORM-INFORMATION-ARCHITECTURE-SPEC.md) | Platform contributors and owner; navigation, workspace boundaries, collection-to-detail flows and responsive composition |
| [BPM-PLATFORM-UI-DESIGN-SPEC.md](BPM-PLATFORM-UI-DESIGN-SPEC.md) | Platform contributors and owner; visual language, component patterns and the source-grounded design preflight |
| [BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md](BPM-PLATFORM-DEFINITION-SCHEDULING-SPEC.md) | Platform and host contributors; exact-version Timer Start scheduling |
| [BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md](BPM-PLATFORM-MESSAGE-INGRESS-SPEC.md) | Platform and host contributors; exact-version Message Start publication and correlated ingress |
| [BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md](BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) | Platform contributors; identity-only, cursor-paged discovery of Process starts |
| [BPM-PLATFORM-HUMAN-WORK-SPEC.md](BPM-PLATFORM-HUMAN-WORK-SPEC.md) | Platform contributors and owner; task inbox, claims, typed form, retry-safe completion and audit |
| [BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md](BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) | Product, semantic and platform contributors; User Task lifecycle separated from a definition-bound form catalog |
| [BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md](BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) | Platform contributors; incident projection, operator authorization, Retry and Cancel actions and incident audit |
| [BPM-PLATFORM-FAILED-PROCESS-SPEC.md](BPM-PLATFORM-FAILED-PROCESS-SPEC.md) | Platform contributors; projection and inspection of the engine's terminal Compensation failure |
| [BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md](BPM-PLATFORM-OPERATOR-HISTORY-AUDIT-EXPORT-SPEC.md) | Platform contributors; per-instance Work and incident-action history and its export |
| [BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md](BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) | Platform and operations contributors; proposed PostgreSQL, background-recovery and projection architecture |
| [BPMN-DIAGRAM-PRESENTATION-DECISION.md](BPMN-DIAGRAM-PRESENTATION-DECISION.md) | Platform and Definitions contributors; embedded-DI and digest-bound sidecar diagram presentation |
| [BPM-PLATFORM-BROWSER-WALKTHROUGH.md](BPM-PLATFORM-BROWSER-WALKTHROUGH.md) | Product users and reviewers; the local-browser tutorial through the platform's workflows |
| [MUE-PREVIEW-ALPHA-SPEC.md](MUE-PREVIEW-ALPHA-SPEC.md) | Product and platform contributors; the historical Alpha preview journey and its boundary |
| [MUE-PREVIEW-BETA-SPEC.md](MUE-PREVIEW-BETA-SPEC.md) | Product and platform contributors; the historical Beta preview boundary and its phase tag |
| [A12-ADD-ON-BOUNDARY-SPEC.md](A12-ADD-ON-BOUNDARY-SPEC.md) | Owner and architecture contributors; the product boundary keeping A12-shaped evidence optional and the engine product-neutral |

### Project, setup and publication

| Document | Audience and ownership |
|---|---|
| Top-level [README.md](../README.md) | BPMN modellers, CIB Seven and Temporal developers; purpose, practical benefit and the assurance boundary |
| [CONTRIBUTOR-SETUP-GUIDE.md](CONTRIBUTOR-SETUP-GUIDE.md) | Contributors and coding agents; clean-machine prerequisites, external-source provisioning, doctor checks and dependency security |
| [SOURCES.md](SOURCES.md) | Researchers; provenance, machine-readable pins and controlled external-source navigation |
| [INFOGRAPHICS.md](INFOGRAPHICS.md) | Maintainers and publication contributors; infographic copy, source owners, visual grammar and the regeneration workflow |
| [../CLAUDE.md](../CLAUDE.md) | Contributors and agents; mandatory repository workflow and architecture boundaries |

### Research and reference

| Document | Audience and ownership |
|---|---|
| [research/README.md](research/README.md) | Researchers; topic index and the boundary between research input and adopted decisions |
| [research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md](research/A12-KERNEL-LEAN-PROCESS-RESEARCH.md) | Semantic contributors; practices transferable from the sibling Lean experiment |
| [research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) | Product and compatibility contributors; the A12 Workflows BPMN, extension, delegate and API denominator |
| [research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md](research/BPM-PLATFORM-COMPETITIVE-SCOPE-RESEARCH.md) | Platform contributors and owner; competitive landscape synthesis and product modules |
| [research/BPM-PLATFORM-STACK-RESEARCH.md](research/BPM-PLATFORM-STACK-RESEARCH.md) | Platform contributors and owner; operator-surface stacks, component-library candidates and licences |
| [research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md](research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md) | Platform contributors and owner; interface patterns of BPM task, Process and operations products |
| [research/CIB-SEVEN-A12-BASELINE-RESEARCH.md](research/CIB-SEVEN-A12-BASELINE-RESEARCH.md) | Product and compatibility contributors; CIB Seven `2.0.0` and `2.2.0` comparison for the A12 execution seam |
| [research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md](research/CIB-SEVEN-BPMN-BREADTH-RESEARCH.md) | Product, semantic and compatibility contributors; pinned CIB Seven `2.2.0` BPMN fixture inventory and claim limits |
| [research/CIB-SEVEN-EXTENSIONS-RESEARCH.md](research/CIB-SEVEN-EXTENSIONS-RESEARCH.md) | Architecture and compatibility contributors; inventory of the Camunda namespace, execution bindings, delegates, expressions, scripts, FEEL and external tasks |
| [research/ENTERPRISE-PROCESS-ORCHESTRATION-COMPETITIVE-LANDSCAPE-RESEARCH.md](research/ENTERPRISE-PROCESS-ORCHESTRATION-COMPETITIVE-LANDSCAPE-RESEARCH.md) | Platform contributors and owner; owner-supplied external market dossier, non-authoritative |
| [research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md](research/EXECUTABLE-BPMN-MODEL-CORPUS-RESEARCH.md) | Product, semantic and platform contributors; retained and external whole-model corpus, deduplication and blocker ranking |
| [research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md](research/HIGH-PRIORITY-BPMN-EXTENSIONS-RESEARCH.md) | Product and semantic contributors; external evaluation of Call Activity, Multi-Instance, Event Sub-Process and non-interrupting boundaries |
| [research/HUMAN-TASKS-AND-FORMS-RESEARCH.md](research/HUMAN-TASKS-AND-FORMS-RESEARCH.md) | Product, semantic and platform contributors; the User Task and Rendering boundary and the Product 2 form recommendation |
| [research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md](research/MINIMAL-USEFUL-BPMN-ENGINE-RESEARCH.md) | Product and semantic contributors; external recommendation for a shippable engine's element profile |
| [research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md](research/NODE-V8-CRASH-INVESTIGATION-RESEARCH.md) | Runtime and host contributors; native GC and async-hook crashes, evidence and qualification limits |
| [research/TEMPORAL-EXECUTION-RESEARCH.md](research/TEMPORAL-EXECUTION-RESEARCH.md) | Host contributors and reviewers; Temporal replay, execution, messaging, failure, concurrency and versioning |
| [research/TLA-AND-BISIMULATION-RESEARCH.md](research/TLA-AND-BISIMULATION-RESEARCH.md) | Semantic and host assurance contributors; formal-methods toolbox, behavioral relations and evidence limits |
| [research/WEBASSEMBLY-SEMANTICS-RESEARCH.md](research/WEBASSEMBLY-SEMANTICS-RESEARCH.md) | Semantic architects; WebAssembly's declarative rules, reference interpreters and conformance tests as a model |
| [reference/bpmn-2.0.2/README.md](reference/bpmn-2.0.2/README.md) | Researchers; external BPMN 2.0.2 corpus location, fetch and verification procedure and reading workflow |

### Outside `docs/`

| Document | Audience and ownership |
|---|---|
| [../contracts/README.md](../contracts/README.md) | Cross-language contributors; the language-neutral schemas and their roles |
| [../scripts/README.md](../scripts/README.md) | Contributors and agents; repository commands, guards and evidence utilities |
| [../model-corpus/README.md](../model-corpus/README.md) | Contributors; the executable model corpus, local commands, provenance and browser eligibility |
| [../model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md](../model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md) | Contributors; generated model inventory and capability coverage |
| [../platform/apps/web/SOURCE-MAP.md](../platform/apps/web/SOURCE-MAP.md) | Platform contributors; web-application source ownership |
| [../platform/modules/definitions/SOURCE-MAP.md](../platform/modules/definitions/SOURCE-MAP.md) | Platform contributors; Definitions module service, repository, route and value ownership |
| [../runners/cibseven/SOURCE-MAP.md](../runners/cibseven/SOURCE-MAP.md) | CIB runner contributors; runner source ownership |
| [../profiles/README.md](../profiles/README.md) and [../scenarios/README.md](../scenarios/README.md) | Contributors; profile and scenario artifact roots |

## Placement rules

- Kernel design, guardrails and the definition of done: [kernel architecture](kernel/ARCHITECTURE-SPEC.md). The meaning of a mechanism: its semantics document under `kernel/semantics/`. What is implemented or open per row: the [kernel status map](kernel/KERNEL-STATUS-MAP.md).
- Mission, authority and approved boundaries: [PROJECT-DESIGN.md](PROJECT-DESIGN.md); repository layout, module ownership and deployment shape: [ARCHITECTURE.md](ARCHITECTURE.md).
- Every reviewed CIB relation to BPMN: [CIB-BPMN-RELATION-REGISTER.md](CIB-BPMN-RELATION-REGISTER.md); reviewed BPMN requirement dispositions: [BPMN-REQUIREMENT-LEDGER.md](BPMN-REQUIREMENT-LEDGER.md).
- Delivery order and the resume point only: [PLAN.md](PLAN.md).
- External-system and background analysis: [research](research/README.md); source revisions, licences and checkout navigation: [SOURCES.md](SOURCES.md).
- Link to the owning document instead of copying its content.
