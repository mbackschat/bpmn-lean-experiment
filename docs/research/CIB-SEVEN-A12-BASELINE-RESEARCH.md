# CIB Seven 2.0 A12 target baseline

## Status and question

This research assesses whether the CIB Seven `2.0.0` release used by A12 Workflows `release/2025.06` can reuse the project's current CIB Seven `2.2.0` semantic-profile evidence for the smallest maintained A12 Service Task path.

It does not approve a profile, dependency change, implementation, or broad release-equivalence claim. Exact checkout provenance belongs in [SOURCES.md](../SOURCES.md), and the product denominator belongs in the [A12 Workflows compatibility ledger](A12-WORKFLOWS-COMPATIBILITY-LEDGER.md).

## Revisions and method

A12 Workflows declares `cibsevenVersion = "2.0.0"`. The pristine CIB checkout contains `v2.0.0` at `57ed69550f1c9c2619b9711d8877418bb084a371` and `v2.2.0` at `834a9874760de8a0107f7c1b32806e37f17fb017`; `v2.0.0` is an ancestor of `v2.2.0`.

The assessment used three distinct checks:

1. compare the exact engine and public-delegate source files on the `CreateDocument` execution path;
2. inspect broader A12-used engine integration surfaces for release differences;
3. run the current packaged oracle tests against the published `2.0.0` artifact without changing the committed `2.2.0` profile identity.

No CIB source file or project dependency declaration was changed.

## Exact `CreateDocument` execution seam

The maintained target is [A12 Workflows `CreateDocument.bpmn`](../../../oss/a12/a12-workflows/workflows-engine/src/testFixtures/resources/bpmn/CreateDocument.bpmn). It is a synchronous `None Start Event → Service Task → None End Event` Process. The Service Task uses `camunda:delegateExpression="${createDocumentDelegate}"`, one literal `camunda:inputParameter` named `documentModelName`, and one `camunda:outputParameter` named `myDocumentReference` whose value is `${newDocRef}`. It has no standard BPMN `implementation` attribute and no async continuation attribute.

The matching [production delegate](../../../oss/a12/a12-workflows/workflows-engine/src/main/kotlin/com/mgmtp/a12/workflows/engine/internal/delegates/document/CreateDocumentDelegate.kt) reads `documentModelName`, invokes the A12 document service, and writes the created reference to Activity-local variable `newDocRef`. CIB output mapping then reads that local value and writes Process variable `myDocumentReference`.

The following CIB source files are byte-identical between `v2.0.0` and `v2.2.0`:

- delegate-expression Service Task behavior;
- `JavaDelegate`, `DelegateExecution`, `VariableScope`, and `BpmnError`;
- the JUEL/EL value provider used by the selected expressions;
- `IoMapping`, `InputParameter`, and `OutputParameter`;
- the relevant BPMN Model API types and parser utility used for input/output extension elements.

The only change in the relevant `BpmnParse` Service Task binding branch is a missing space added to one error message. It does not affect admitted source or successful execution.

The shared source mechanism establishes a strong candidate for sharing reviewed clauses and separating witnesses for this exact successful path. It does not turn one release's executable evidence into the other release's evidence.

## Executable compatibility probe

The current eighteen-test packaged CIB oracle suite was run once with its dependency property overridden to CIB Seven `2.0.0`, using the repository Maven settings and Java 21.

Seventeen tests passed. The only failure was the existing engine-version identity assertion: the runner intentionally emits its committed profile version `2.2.0`, while the loaded `ProcessEngine` package reported `2.0.0`. The scenario's semantic outcome, exact trace, repeated-run equality, PVM projection, cleanup, and timing assertions all ran before that version assertion and passed.

This is useful negative evidence. The current runner cannot be relabeled as a `2.0.0` oracle merely because the behavioral tests pass; profile identity is an enforced part of the evidence.

The probe is broad enough to reduce immediate feasibility risk for the already supported task, timer, parallel, and payload-free effect cases. It is not content-bound `2.0.0` evidence for `CreateDocument`, and it does not cover A12's Spring, persistence, scripting, serialization, REST, or plugin integration.

## Material release differences

There are 518 changed files under CIB engine main sources between the tags. A12 Workflows imports public and internal engine APIs and embeds substantially more than the exact Service Task seam, so broad release equivalence is false as a project assumption.

Relevant changed areas include:

- `ProcessEngineConfigurationImpl`, including engine configuration and job-related behavior;
- script-engine management and the later CIB-specific script utility;
- object-value deserialization fallback between legacy Camunda and CIB package names;
- database schemas, mappings, queries, persistence entities, authorization, history, and job configuration.

A12 Workflows subclasses CIB's Java object serializer and configures scripting, engine plugins, Spring Boot integration, REST, persistence, and transaction behavior. Those consumers make the release differences relevant to the product even though the `CreateDocument` string-only success path is unchanged.

## Relationship to BPMN and CIB evidence

The selected input/output extension elements are CIB extensions over BPMN's general data and expression hooks. The exact target path also relies on CIB's synchronous transaction composition:

1. input mapping evaluates before the Activity and writes Activity-local input;
2. the delegate runs inside the same engine command;
3. the delegate writes Activity-local output;
4. output mapping evaluates while the Activity scope is live and writes the outer Process scope;
5. successful completion advances to the End Event before the command commits.

A Temporal Activity necessarily introduces a committed effect intent and a durable boundary before the external call. Exact successful final observations can refine the CIB path, but rollback and failure atomicity cannot be claimed from that success evidence. A target profile must name this transaction difference instead of presenting the Temporal host as a transparent implementation detail.

## Conclusion

Keep CIB Seven `2.0.0` and `2.2.0` as distinct executable profiles.

For the exact `CreateDocument` successful string-only path, share reviewed semantic clauses, source-mechanism analysis, and separating-witness design where the source files are identical. Require fresh `2.0.0` profile identity, packaged execution, raw observations, content-bound evidence, and fidelity labels before making an A12 target claim.

Do not infer broader A12 compatibility from the exact seam. Scripting, Java object serialization, Spring configuration, jobs, persistence, REST, plugins, and engine-internal consumers require their own `2.0.0` target assessments.

The next bounded decision is the [CreateDocument data and mapping proposal](../capsules/CREATE-DOCUMENT-DATA-PROPOSAL.md). It selects the smallest typed variable, input/output mapping, expression, effect-patch, and successful transaction-refinement account capable of admitting the maintained model without source rewriting.

## Reopen conditions

Reopen this assessment before:

- reusing any `2.2.0` evidence envelope under a `2.0.0` profile identity;
- claiming a changed CIB source area is behaviorally interchangeable;
- admitting scripts, object-serialized variables, incidents, engine plugins, persistence assumptions, or internal engine APIs;
- claiming CIB synchronous rollback equivalence for an external Temporal Activity;
- upgrading either target release.
