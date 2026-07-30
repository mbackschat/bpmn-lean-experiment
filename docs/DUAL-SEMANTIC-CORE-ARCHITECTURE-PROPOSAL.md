# Dual semantic-core architecture proposal

**Status:** Owner-rejected on 2026-07-26; retained as the rejected-account record and as the starting point if its exact reopen trigger occurs

## Owner decision

Retain the current architecture:

```text
reviewed BPMN/profile account
             ↓
     executable Lean semantics
             ↓
  language-neutral Semantic Process IL
             ↓
 pure TypeScript semantic core
             ↓
 TypeScript Temporal Workflow
             ↓
 versioned effect protocol
       ↙             ↘
TypeScript Worker   JVM Worker
```

Do not add a separately written Java semantic core and do not run the proposed Java-core experiment.

The Java-core account has no forcing consumer, supplies bounded assurance surplus, and would impose lockstep implementation and review cost on every future capsule. The existing TypeScript core remains the single production semantic realization. Java integration belongs at the client façade and Activity Worker boundaries.

This rejection satisfied the interpreter-language decision that previously blocked the [Service Task effect spec](capsules/SERVICE-TASK-EFFECT-SPEC.md). The exact packaged-CIB binding and bounded semantic account now live in that specification.

## What “derived from Lean” meant

The rejected account did not propose compiling Lean to Java or TypeScript. It proposed two separately written production implementations of one Lean-stated operational account.

That distinction remains useful:

- Lean is the formal semantic authority for the reviewed profile account.
- The TypeScript core is an independent transcription of that account, not an independently selected account.
- Agreement with another transcription can expose target-specific defects but cannot validate shared capsule wording, shared schemas, shared scenarios, or the selected BPMN interpretation.
- Normative/profile review and classified CIB evidence remain necessary regardless of implementation language.

No generated or extracted production evaluator follows from the phrase “Lean-based semantics.”

## Why the second core is rejected

### No concrete JVM semantic-execution consumer

The proposed experiment’s own stop condition was already true before implementation: no approved product mode requires semantic transitions to execute inside the JVM.

The currently relevant Java needs do not require a Java semantic core:

| Migration need | Correct boundary |
|---|---|
| Existing Java business logic | JVM Temporal Activity Worker behind the versioned effect protocol |
| Spring Boot API compatibility façade | Java client that sends Process commands and reads public projections |
| Existing `JavaDelegate` compatibility | Bounded JVM Worker bridge with an explicitly supported `DelegateExecution` subset |
| General engine Java/REST/plugin replacement | Separate compatibility program, not another semantic-core language |

A Java semantic core would become necessary only for a product mode that owns and advances semantic Process state in-process on the JVM. No such mode is approved.

### The experiment could not discover its deciding fact

Whether the project has a JVM semantic-execution consumer is a product decision, not an executable property. Implementing the Java core could measure transcription cost and parity, but it could not establish the missing consumer that would justify permanent maintenance.

The proposed experiment therefore lacked a separating witness for its decisive account. It would spend implementation effort to learn something the owner can decide without code.

### Bounded assurance surplus

A Java core would be a third transcription of one reviewed account. It would share:

- Semantic Process IL and wire schemas;
- capsule rules and interpretation decisions;
- answer-free scenarios;
- canonical observations;
- the differential comparator;
- profile and source fixtures.

Java-specific defects could fail apart from TypeScript defects, and target-specific mutations could prove that both lanes reached comparison. That is useful localization, but the existing Lean/TypeScript comparison already supplies the main transcription check. The Java lane would not provide another BPMN authority or independent account.

### Permanent capsule cost

A credible dual-core architecture cannot permit a silently lagging Java implementation. Every semantic capsule would need Lean, TypeScript, and Java implementation, review, mutations, wire handling, and differential closure before both production targets could be claimed.

That recurring cost is poorly aligned with the project’s dominant risks: Temporal refinement, external-effect correctness, migration coverage, variables, expressions, error propagation, and capsule economics.

### It delayed the forcing work

The Service Task/Activity capsule is the next approved Temporal feasibility discriminator. A consumerless core-language experiment would have interposed another architecture exercise before `awaitEffect` without reducing the effect, retry, reconciliation, or migration risks that the capsule exists to test.

## Effect of the CIB Seven migration goal

The driving product goal is to replace an existing CIB Seven solution—its BPMN Processes plus selected Java delegates, expressions, and integration code—with a Temporal-hosted, Lean-assured implementation whose migration path is explicit and, where feasible, adapter-based.

That context strengthens the need for JVM Workers and Java client compatibility, but it does not justify a Java semantic core.

Temporal Workflows own durable Process execution. Existing Java code therefore migrates into one of two shapes:

- effectful code executes as a JVM Activity Worker behind a committed language-neutral request/result contract;
- engine API callers use a Java façade that translates supported calls into Process commands and public projections.

Running semantic transitions in a Java Activity or remote semantic service would move the interpreter out of the current replay-deterministic Workflow boundary. Rewriting the Workflow in Java would create a second adapter and replay account. Neither is required for migration to the selected Temporal-hosted product.

The migration goal narrows the relevant feature denominator from “all possible BPMN and CIB behavior” to the actual target solution’s used surface. It does not weaken the project’s versioned claim discipline or authorize an unqualified drop-in replacement claim.

## Why TypeScript remains the selected Workflow language

For this project, the decisive question is not which language is generally safer. It is which Temporal SDK best hosts a pure deterministic interpreter inline in Workflow code.

| Axis | TypeScript consequence | Java consequence | Decision |
|---|---|---|---|
| Replay determinism | The pinned TypeScript SDK runs Workflow code in a deterministic sandbox, removes ordinary Node/DOM I/O, and supplies deterministic time/random behavior | The Java SDK relies more heavily on Workflow-code discipline and review to avoid ambient JVM time, I/O, global state, ordinary threads, or iteration-order leaks | Prefer TypeScript’s enforcing boundary |
| Concurrency model | The single-threaded event loop and interleaving at `await` points match the project’s one semantic-input loop | Cooperative Workflow threads are valid but introduce a more thread-shaped reasoning model | Prefer the direct event-loop fit |
| Semantic transcription | Discriminated unions, immutable structural values, and exhaustive `switch` checks closely match the Lean inductive account | Java 21 sealed interfaces, records, and exhaustive switches are capable but more verbose | TypeScript is at least as suitable for this bounded core |
| Wire contracts | JSON-shaped structural types align directly with current schemas and scenarios | Java requires an explicit strict mapping layer for absence, `null`, enums, generics, and unknown fields | Prefer the smaller existing boundary |
| Oracle independence | The language boundary prevents importing CIB Seven engine classes into the semantic core | A Java core would be one dependency declaration away from oracle types and idioms | TypeScript makes the non-transplant rule cheaper to preserve |
| Existing evidence | Worker restart, Update handling, durable timers, replay, and pipeline budgets are already executable on the pinned SDK | A Java Workflow would require a new adapter and replay lane | Keep the evidenced implementation |

Java retains real advantages in 64-bit integer ergonomics, mature JVM operations, and large Worker-fleet tuning. Those advantages matter at the Worker and client tiers and do not outweigh TypeScript’s deterministic Workflow boundary for the current interpreter. The approved polyglot Worker architecture uses the JVM where those strengths pay without moving semantic authority.

The TypeScript-specific risks remain explicit:

- logical-time and count values need one exact safe-integer wire domain;
- Workflow bundle contents are a deployment and replay boundary;
- V8 isolate memory and sticky-cache sizing require measurement at scale;
- the pinned SDK typing workaround remains quarantined to the adapter;
- safe deterministic collection ordering must never inherit ambient insertion order.

The [Temporal execution research](research/TEMPORAL-EXECUTION-RESEARCH.md) owns the pinned SDK mechanisms and the live replay boundary.

## Answers to the independent-review questions

1. **Concrete JVM semantic consumer:** none is approved. Java Workers and a Spring/API façade are not such consumers.
2. **Assurance surplus:** insufficient to justify permanent lockstep maintenance; it is target-localization evidence, not a new account.
3. **Language if the trigger occurred:** Java 21 would be the correct second transcription language. Kotlin Multiplatform would optimize one shared implementation and defeat the independence rationale.
4. **Independence rules:** the proposed no-shared-evaluator, private-state, and target-mutation rules were sound, but they did not create a consumer.
5. **Cross-language gaps:** the numeric, ordering, and strict-decoding findings are valid defects in the current wire boundary and survive rejection.
6. **Experiment scope:** locally bounded, but wrongly sequenced ahead of the forcing Service Task work.
7. **Provisional discriminator:** none exists and none should be created. Retain this document, not implementation.

## Salvaged wire-contract work

The proposal exposed cross-language exactness obligations that already matter for Lean, TypeScript, retained JSON artifacts, and the approved polyglot Activity protocol. They do not depend on a Java semantic core.

### Numeric domain

Pin every integer represented as a JavaScript number to the JavaScript-safe integer domain in schemas, TypeScript decoders, Lean decoders, producers, and retained mutations. For non-negative fields, the maximum is `9007199254740991`; positive occurrence and multiplicity fields retain their positive lower bounds.

The current TypeScript runtime already rejects unsafe logical time and timer-deadline overflow, while the JSON Schemas currently state only an integer lower bound. The atomic pre-release change must close that discrepancy. A wider integer or decimal-string domain is a separate future wire decision.

### Canonical identifier ordering

Do not inherit identifier order from JavaScript’s default UTF-16 code-unit comparison. Preserve the migration-friendly Unicode identifier surface and specify one language-neutral comparison rather than imposing an ASCII-only source restriction without target-inventory evidence.

The selected account for the planned hardening is lexicographic Unicode scalar-value order over a well-formed exact identifier string, without normalization. Reject unpaired surrogate encodings at the JSON boundary, and lock the rule with Basic Multilingual Plane and supplementary-plane identifiers in TypeScript and Lean. If the target inventory later proves a narrower identifier domain, admission may be reconsidered through the ordinary source-profile process.

### Strict JSON behavior

Add boundary cases for:

- unknown and missing fields;
- closed enum variants;
- `null` versus field absence;
- duplicate object keys;
- unsafe and non-integral numbers;
- canonical unordered-array sorting.

Exercise the cases through both existing decoder languages, TypeScript and Lean. Duplicate-key detection must occur at a byte-aware parse boundary if the current parsed-object APIs have already discarded that distinction; last-key-wins behavior must not be accepted silently.

This wire work is ordinary atomic pre-release evolution. It changes every affected producer, consumer, schema, fixture, and mutation together and does not introduce a compatibility reader.

## Migration-target inventory

Migration ease cannot be planned from the universe of CIB features. The project needs a read-only inventory of the actual target solution.

Once the owner supplies or identifies its checkout, record it in [SOURCES.md](SOURCES.md) and inventory:

- BPMN element and event usage;
- Camunda/CIB extension QNames, contexts, and values;
- Service Task binding styles: class, delegate expression, expression, topic, or other;
- exact `DelegateExecution` methods called by existing delegates;
- variable names, types, scopes, reads, writes, and serialization assumptions;
- JUEL expression forms and coercion complexity;
- execution/task listeners, field injection, mappings, forms, retry cycles, incidents, and external tasks;
- `BpmnError` and other exception patterns;
- Java/REST engine API callers and the precise calls they make.

The resulting defined denominator should become a migration-target ledger rather than an informal feature list. It should measure:

- unchanged model-admission coverage;
- unmodified delegate coverage through a bounded bridge;
- Java/API calls supported by an adapter;
- classified source or code migration required for every remainder.

Do not invent percentage targets before the inventory defines the denominator. The inventory re-prioritizes deferred compatibility lanes by actual migration value.

## Service Task and later-capsule consequences

The Service Task effect capsule remains success-only, but its result contract should retain a discriminated-union shape so a future reviewed `BpmnError` result can be added without confusing transport failure with semantic error propagation. No `BpmnError` variant or boundary-event semantics is admitted by the current capsule.

Variables and expressions move closer to the migration critical path:

- delegates commonly read and write variables;
- practical Process routing commonly depends on expressions;
- a typed effect input/result variable-patch contract is therefore central to delegate migration rather than optional polish;
- the exact target inventory, not generic CIB capability, should determine the first supported expression and variable subset.

After the inventory, assess the smallest exact expression subset covering the target solution. For a selected CIB JUEL profile, delegate parsing and evaluation to the actual pinned JUEL runtime behind an Activity boundary; do not build a project-native JUEL grammar, AST, or evaluator. Keep mutation and capability-bearing expressions outside the read-only profile and keep all evaluation outside Workflow code.

`BpmnError` usage in the target inventory may force error-result and boundary-event capsules earlier than the generic BPMN sequence would. That remains a profile and semantic decision, not an Activity exception-mapping shortcut.

## Reopen trigger

Reopen this proposal only when the owner names a **non-Temporal embedded JVM product mode that must own and advance semantic Process state in-process**.

The following do not satisfy the trigger:

- a Java or Kotlin Activity Worker;
- an existing Java delegate;
- a Spring Boot REST façade;
- Java client SDK ergonomics;
- a preference for Spring hosting;
- general implementation diversity.

If the trigger occurs, the rejected experiment design below is the starting point, but it requires a fresh owner approval and dependency decision.

## Dormant experiment design

### Included

- Java 21;
- the current six Semantic Process operations;
- the sequential User Task, balanced parallel fork/join, and exact `PT1S` timer slices;
- strict program and stimulus admission;
- private Java runtime state;
- exact comparison against Lean and TypeScript;
- numeric, ordering, unknown-field, enum, `null`, and malformed-reference cases;
- direct in-process JVM invocation without Node, Spring, CIB, Temporal, network, or filesystem access;
- build, runtime, and per-operation duplication measurement.

### Required discriminators

1. Java produces the exact maintained canonical results without consuming expected results.
2. A Java-only any-input `synchronize` mutation fails the parallel witness while Lean and TypeScript remain green.
3. A TypeScript-only mutation fails while Lean and Java remain green; this proves localization, not unique detection surplus.
4. Java rejects a logical time outside the selected wire domain before semantic execution.
5. Program-operation and collection insertion order do not change observations.

### Excluded

- new BPMN features or Semantic Process operations;
- Spring Boot;
- a Java Temporal Workflow or adapter;
- Java Activity Workers or delegate compatibility;
- a Java BPMN importer or lowerer;
- runtime-state migration between implementations;
- generated evaluator source;
- production packaging.

### Adoption conditions

A reopened dual-core account requires:

1. the named non-Temporal embedded JVM product mode;
2. a green bounded experiment with target-specific mutations;
3. exact cross-language numeric, ordering, decoding, and observation contracts;
4. explicit acceptance of measured per-capsule duplication;
5. a pure independently implemented Java core with no CIB, Temporal, Spring, or TypeScript runtime dependency;
6. a separately approved JVM durability/hosting contract;
7. lockstep capsule closure for every claimed Java feature.

Without all seven conditions, retain the TypeScript semantic core and polyglot Worker boundary.
