# BPMN 2.0.2 conformance target

## Status

Adopted durable target; exact implemented and absent coverage remains in [IMPLEMENTATION-MAP.md](IMPLEMENTATION-MAP.md).

This document owns the project’s standard-facing goal and the semantic consequences of the official BPMN 2.0.2 conformance model. It is an original project digest of the locally ingested sources described in the [reference corpus](reference/bpmn-2.0.2/README.md).

## Target

The ultimate product target is **OMG BPMN 2.0.2 Process Execution Conformance** for a Temporal-hosted adapter that imports BPMN Process diagram types, including their definitional Collaboration, and executes the operational semantics.

This is the exact standards interpretation of “a fully BPMN V2 conforming Temporal adapter that reads BPMN V2 and runs on Temporal.”

It is not **BPMN Complete Conformance**. The standard reserves Complete Conformance for an implementation that simultaneously satisfies Process Modeling, Process Execution, BPEL Process Execution, and Choreography Modeling conformance. A headless execution adapter is not required to create, display, or export the standard graphical notation, map models to WS-BPEL, or interpret choreography models.

If the project later grows a graphical modeler, exporter, BPEL mapper, or choreography engine, those capabilities require separately declared conformance goals rather than silently broadening the adapter claim.

## Three independent claims

| Claim | Authority | Ultimate meaning |
|---|---|---|
| BPMN conformance | OMG BPMN 2.0.2 | The adapter imports Process diagrams and supports the required metamodel, operational execution semantics, and Activity lifecycle |
| CIB compatibility | Immutable CIB Seven semantic profile plus differential evidence | Observable behavior agrees with one pinned CIB release, configuration, feature surface, and observation boundary |
| Temporal correctness | Semantic-core-to-adapter refinement plus replay and integration evidence | Durable Temporal execution adds only permitted hidden work and preserves semantic-core-visible BPMN behavior |

Agreement with CIB Seven does not by itself prove BPMN conformance. BPMN conformance does not imply CIB-specific jobs, retries, incidents, extensions, or listener behavior. Passing Temporal replay does not establish either semantic claim.

The working presumption is that CIB Seven implements BPMN faithfully, operationalizes underspecified or inconsistent areas, and adds explicit engine extensions. The [CIB–BPMN relationship register](CIB-BPMN-RELATION-REGISTER.md) records those categories separately and keeps any evidence-backed candidate or confirmed normative deviation prominent; CIB specificity or extension is never classified as deviation by default.

## Layering and coverage accounting

BPMN Process Execution coverage is the primary implementation roadmap. The reusable engine is specified and implemented in standard BPMN terms first; a CIB Seven profile may then refine an underspecified choice, select an engine extension, or record a bounded compatibility relation. A12 Workflows is a downstream adoption target that may prioritize which BPMN requirements and CIB overlays are addressed first, but it is not a BPMN authority or a substitute conformance denominator.

The project therefore maintains three separate views:

| View | Denominator and owner | Effect on work |
|---|---|---|
| BPMN Process Execution coverage | Reviewed normative requirements in the [BPMN requirement ledger](BPMN-REQUIREMENT-LEDGER.md), eventually expanded to the complete applicable Process Execution corpus | Drives reusable semantic mechanisms, admission, Lean, the TypeScript core, and Temporal refinement |
| CIB Seven profile coverage | Classified relationships and extension families in the [CIB–BPMN register](CIB-BPMN-RELATION-REGISTER.md) and named profiles | Added on demand when a BPMN ambiguity, selected compatibility promise, host-realization question, or downstream source extension requires it |
| A12 Workflows adoption | Exact models, delegates, façade calls, and migration dispositions in the [A12 compatibility ledger](research/A12-WORKFLOWS-COMPATIBILITY-LEDGER.md) | Prioritizes lower-layer work and later verifies the separately bounded adoption adapter |

These figures must never be merged. A model admitted unchanged is not an additional BPMN conformance point; a BPMN rule implemented without the target's extension binding is not A12 adoption; and a CIB observation does not count twice as both source of a profile rule and independent confirmation of that rule.

A representative vertical slice may exercise all layers to establish feasibility. Once its seams are proven, coverage expands by semantic mechanism rather than by reproducing the entire Lean/core/Temporal/CIB stack for every downstream model. Additional CIB work is required only when it supplies a distinct classified proposition or host-realization check.

## Normative route

| Source area | Project use |
|---|---|
| Clause 2, Conformance | Defines the target conformance type and its import/execution obligations |
| Clause 8, BPMN Core Structure | Supplies shared metamodel foundations, references, expressions, events, gateways, messages, and services |
| Clause 9, Collaboration | Supplies the definitional Collaboration and message interactions imported with a Process |
| Clause 10, Process | Supplies Process structure, static constraints, executable-process attributes, Activities, data, Events, gateways, scopes, compensation, lanes, and related semantics |
| Clause 12, BPMN Notation and Diagrams | Supplies BPMN Diagram Interchange; accepted XML can retain or ignore presentation data according to the eventual import contract, but DI never defines execution behavior |
| Clause 13, BPMN Execution Semantics | Supplies Process instantiation/completion, token-based semantic explanations, Activity lifecycle, Tasks, scopes, loops, multi-instance behavior, gateways, Events, compensation, and termination |
| Clause 15, Exchange Formats | Supplies BPMN document roots, namespaces, imports, cross-file QName references, and the normative machine-readable artifact route |
| Normative CMOF files | Supply the abstract metamodel: packages, classes, inheritance, properties, associations, multiplicities, containment, and defaults |
| Normative XSD/XSLT files | Supply the concrete XML representation and normative XMI-to-BPMN-XML transformation route |

The [requirement-disposition ledger](BPMN-REQUIREMENT-LEDGER.md) must link every reviewed construct to the applicable normative clause, machine-readable element, profile interpretation, capsule or Lean owner, executable case, and evidence status. It is seeded incrementally and must not claim a complete conformance denominator until the applicable corpus has been exhaustively classified.

[The BPMN XML ingestion decision](BPMN-XML-INGESTION-DECISION.md#normative-artifacts-and-semantic-authority) owns the operational use of these artifact classes: CMOF-derived metamodel facts constrain structural admission, XSD/XSLT constrain interchange, and prose, figures, and issue dispositions constrain executable semantics. None of the machine-readable artifacts alone defines token behavior or Activity lifecycle.

## Process Execution boundary

The standard requires an execution-conforming tool to import BPMN Process diagram types, including their definitional Collaboration, support and interpret the underlying metamodel, and implement the operational execution semantics and Activity lifecycle.

An executable BPMN Process is a private Process intended for execution. Its model must contain the execution detail required by the standard, including formal conditions and required event/service metadata where applicable.

The standard’s token vocabulary is explanatory, not an implementation mandate. Lean, TypeScript, CIB Seven, and Temporal may use different internal representations as long as their visible execution behavior satisfies the declared contract.

Clause 10 is not independently required as a graphical/modeling conformance claim for Process Execution, but its Process metamodel and execution-relevant static constraints remain part of the model that an execution-conforming implementation imports and interprets.

## Import and admission policy

Process Execution Conformance requires more than parsing one self-contained XML file. The eventual ingestion boundary must support `bpmn:definitions` roots and target namespaces, imported BPMN 2.0 definitions, XML Schema 1.0 types, WSDL 2.0 interfaces, transitive import closure, and cross-file QName references. Import acceptance, model normalization, deployment validation, and execution admission are separate stages with separate outcomes.

That separation matters because Clause 15 permits interchange of incomplete models, while execution requires the details needed by the operational semantics. A syntactically importable document must not be silently treated as deployable or executable.

The standard is inconsistent about omitted `Process.isExecutable`: its metamodel and XSD make the attribute optional without an XSD default, while later prose says it defaults to true. Until an immutable profile records a different interpretation, the conservative admission policy is to execute only a private Process with explicit `isExecutable="true"`. Imported Processes outside that policy remain inspectable and diagnosable.

The summary conformance table labels Process Execution exchange as “Import/Export,” while the detailed Process Execution clause explicitly requires import only. The requirement ledger must record this conflict. The initial product contract may scope its formal claim to import under the detailed clause, but a maximally defensible conformance program should add loss-aware export and round-trip evidence rather than relying on that reading.

## Elements that Process Execution Conformance may ignore

Clause 13 classifies the following as non-operational or containing non-operational aspects:

- Manual Task;
- Abstract Task;
- DataState;
- IORules;
- Ad-Hoc Process;
- physical `ItemDefinition` values;
- `DataInput.inputSetWithWhileExecuting`;
- `DataOutput.outputSetWithWhileExecuting`;
- `Process.isClosed`;
- `SequenceFlow.isImmediate`.

The project may optionally define executable extensions for these elements, but those choices are not required for Process Execution Conformance and must be versioned in a profile. CIB Seven behavior for any such extension remains a separate compatibility question.

Ignoring an element means making an explicit supported, rejected, or unsupported decision. It never means silently converting a construct into a no-op when doing so could change control flow or completion.

The standard’s non-operational “Ad-Hoc Process” entry conflicts with its operational description of Ad-Hoc Sub-Processes. Those terms must remain distinct in the ledger, and the applicable open issue must be resolved before assigning either one an executable disposition.

## Formalization consequences

The standard says the execution semantics are fully formalized for conformance purposes, yet Clause 13 describes them as informal text informed by prior mathematical work and explicitly leaves some elements non-operational. Lean therefore has real work to do: turn prose, diagrams, tables, static constraints, and ambiguity decisions into an executable relation without pretending the source is already machine-complete.

The highest-risk formalization areas include:

- Activity lifecycle states and interruption/completion dependencies;
- implicit merge/split behavior when Activities have multiple incoming or outgoing flows;
- inclusive and complex gateway reachability/reset behavior;
- event subscription lifetime, correlation, races, and cancellation;
- Process and Sub-Process completion;
- loops and sequential/parallel multi-instance destruction;
- data InputSet/OutputSet availability, expressions, and external type systems;
- compensation ordering and snapshot state;
- logical time, fairness, scheduler choices, and divergence, which the prose does not fully operationalize;
- transaction, job, retry, incident, listener, and persistence behavior that belongs to the CIB profile rather than bare BPMN execution conformance.

BPMN expression support, one project-owned language profile, and CIB JUEL compatibility are separate claims. BPMN supplies `Expression`/`FormalExpression`, definition-level and expression-level language selection, and BPMN rules that consume expression results; it does not make JUEL part of BPMN 2.0.2 merely because the target corpus uses it. The first standards profile selects the dependency-free [Simple Boolean language](SIMPLE-BOOLEAN-EXPRESSION-DECISION.md) by an explicit immutable URI and rejects omitted language because BPMN's default remains XPath. Its complete bounded grammar and [Exclusive Gateway consumer](capsules/EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) close one exact `FormalExpression` and conditional-routing slice in Lean, TypeScript, and Temporal while XPath, JUEL, and the general expression family remain unsupported. A separately selected CIB profile may later delegate JUEL parsing and evaluation to the pinned runtime, but it must retain the same project ownership of visible context, evaluation point, required result, failure consequence, and consuming transition.

The converted standard also exposes stale internal cross-references: the conformance and `isExecutable` text point to Clause 14 for execution semantics, while BPMN 2.0.2 places execution semantics in Clause 13 and uses Clause 14 for WS-BPEL mapping. OMG issue `BPMN21-445` separately confirms that the conformance sub-clause references in Section 2.1 are shifted by one. Treat these as source issues to record, not as authority to formalize the wrong clause.

Other specification conflicts that need explicit ledger decisions include `Import.location` being optional in the metamodel prose but required by the XSD, multi-instance collection extraction and output updating being underspecified, and the difference between accepting incomplete interchange documents and admitting executable deployments.

The Markdown conversion is a search aid rather than a sole normative source. It lost the Task section heading, damaged part of the Complex Gateway table, and cannot preserve all lifecycle information carried by diagrams. Semantic work must cross-check the original PDF, normative machine-readable artifacts, and relevant figures.

OMG maintains a live BPMN 2.0.2 open-issues view at `https://issues.omg.org/issues/spec/BPMN/2.0.2`. It includes execution-relevant ambiguities such as inclusive-gateway synchronization, multiple start events, multi-instance wording, event classification, validation rules, activity conditional flows, cancellation, and compensation. Each affected semantic capsule must consult and record applicable issue dispositions; the base PDF alone is not a sufficient ambiguity audit.

## Claim discipline

Until every applicable Process Execution conformance point has an implemented disposition and evidence, releases must say they are **based on BPMN 2.0.2** and identify their supported execution profile. They must not claim BPMN Process Execution Conformance.

The phrase “fully BPMN V2 compatible” is reserved for informal goal-setting. Formal release claims must name **BPMN 2.0.2 Process Execution Conformance**, the profile version, the applicable conformance points, and the evidence boundary.
