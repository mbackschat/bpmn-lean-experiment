# CIB Seven 2.2.0 executable BPMN breadth

## Status and question

This research inventories the pinned CIB Seven core BPMN test-resource corpus to answer one scheduling question: which uncovered reusable BPMN Process Execution mechanism should follow the runnable Temporal MVP?

The inventory is a roadmap input, not a BPMN conformance measure, a CIB compatibility percentage, or evidence that every matching fixture executes the tagged construct. BPMN meaning remains owned by the standard and approved capsules; exact implementation and evidence status remain in the [implementation map](../IMPLEMENTATION-MAP.md).

## Source boundary

The inspected checkout is the pristine CIB Seven source at `5a45b47ea22688d774de97277c3ff7013f54fdd2` recorded in [SOURCES.md](../SOURCES.md#cib-seven). Its core BPMN Java and resource trees are byte-identical to the published `v2.2.0` tag at `834a9874760de8a0107f7c1b32806e37f17fb017`, so the inventory orders work against the requested CIB Seven `2.2.0` baseline without treating the checkout's `2.3.0-SNAPSHOT` identity as a `2.2.0` executable profile.

The denominator is the 1,144 `*.bpmn` and `*.bpmn20.xml` files below `engine/src/test/resources/org/cibseven/bpm/engine/test/bpmn`. It excludes Java-built models, non-core modules, examples, model-API tests, and extension-only fixtures. Counts are file-level lexical occurrences and overlap: one file may contribute to several rows.

## Inventory method and reproducibility boundary

The broad inventory enumerates the resource files once and searches namespace-tolerant opening tags for each BPMN element or EventDefinition. Sub-Process classification uses XML parsing rather than a plain tag count: a `subProcess` with `triggeredByEvent="true"` is an Event Sub-Process; an absent or non-true value is ordinary. File counts and occurrence counts are recorded separately.

The exact revision, denominator, paths, matching rules, and results are retained here, but the one-off inventory command is not yet a project harness. Exact regeneration is therefore reviewable but not an executable repository gate. If the inventory is refreshed or becomes a recurring roadmap input, first promote the enumeration into a checked dependency-free script with a fixture-based classification test.

Lexical counts are scheduling signals only. They can miss a construct created by a Java model builder, count an invalid or negative deployment fixture, and say nothing about behavioral depth. A candidate therefore still needs an exact standard proposition, an executable CIB probe when a CIB relationship is selected, and a bounded capsule before implementation.

## Broad fixture signals

| Construct | Files containing it |
|---|---:|
| User Task | 737 |
| any Sub-Process | 334 |
| Boundary Event | 298 |
| Service Task | 232 |
| Multi-Instance Loop Characteristics | 160 |
| Call Activity | 145 |
| Parallel Gateway | 144 |
| Timer Event Definition | 138 |
| Receive Task | 121 |
| Intermediate Throw Event | 116 |
| Error Event Definition | 111 |
| Message Event Definition | 109 |
| Escalation Event Definition | 80 |
| Compensation Event Definition | 78 |
| Signal Event Definition | 69 |
| Exclusive Gateway | 68 |
| Intermediate Catch Event | 67 |
| Conditional Event Definition | 44 |
| Script Task | 37 |
| Inclusive Gateway | 29 |
| Terminate Event Definition | 22 |
| Transaction | 21 |
| Manual Task | 19 |
| Event-Based Gateway | 16 |
| Cancel Event Definition | 14 |
| Send Task | 9 |
| Link Event Definition | 4 |
| Business Rule Task | 2 |
| Complex Gateway | 0 |

The 334 Sub-Process files split into 265 files with at least one ordinary embedded Sub-Process, 157 with at least one Event Sub-Process, and 88 containing both. The corpus contains 340 ordinary Sub-Process occurrences and 180 Event Sub-Process occurrences.

## Exact CIB precedent for ordinary completion

The pinned source test `org.cibseven.bpm.engine.test.bpmn.subprocess.SubProcessTest#testSimpleSubProcess` deploys `SubProcessTest.testSimpleSubProcess.bpmn20.xml` and uses public runtime and task services. Starting the Process exposes the child User Task, the public Activity-instance tree contains Process → Sub-Process → User Task, completing the task destroys the child scope, and the Process ends.

That source test is a strong probe seed, not retained project evidence. It neither supplies a project-owned answer-free scenario nor establishes the richer two-child completion-order discriminator selected below.

## Priority decision

Ordinary embedded Sub-Process entry and normal completion is the next breadth capsule. It precedes the existing Error-propagation proposal for four reasons:

1. It is the largest uncovered structural foundation in this bounded corpus inventory: 265 fixture files contain an ordinary embedded Sub-Process.
2. It creates explicit definition scope, runtime scope occurrence, ownership, and normal quiescent completion once; Event Sub-Processes, boundary propagation, multi-instance bodies, transactions, and nested scopes can then add their distinct propositions without inventing a second scope model.
3. CIB already supplies a compact public-service precedent for the basic lifecycle, while a two-child project witness can separate quiescent completion from premature exit.
4. Its Temporal preflight needs only the existing passive User Task Update mechanism. It does not require Child Workflows, Temporal cancellation, Signals, Timers, Activities, or host races.

Implementing the error-only proposal first would install scope entry with deliberately absent normal output and completion. Ordinary completion would then require another breaking Semantic Process definition and runtime replacement. Reversing the order makes Error propagation a cancellation-and-handler extension over an already checked scope lifecycle.

## Ordered consequences

The selected [ordinary embedded Sub-Process proposal](../capsules/EMBEDDED-SUBPROCESS-COMPLETION-PROPOSAL.md) is first. The [Error-propagation proposal](../capsules/SUBPROCESS-ERROR-PROPAGATION-PROPOSAL.md) remains valuable but must rebase its representation and versioning account on the completed ordinary-scope foundation before approval.

The next breadth ranking after ordinary completion should be repeated against both the remaining construct inventory and the mechanisms actually established. Raw prevalence does not automatically make Boundary Events next: the chosen item must still be the smallest reusable proposition whose admission, semantics, host mapping, and evidence can close without importing adjacent families accidentally.

## Limits and re-open conditions

This inventory does not count BPMN requirements, behavioral variants, combinations, or negative cases. It does not measure Collaboration, choreography, human-resource products, forms, task lists, identity, deployment, or A12 adoption. Those surfaces retain their separate denominators and scope decisions.

Re-run the inventory when the pinned CIB breadth baseline changes, when the resource denominator changes materially, or after a mechanism closes and its reusable consequences change the cheapest next capsule. Do not re-run it after every implementation-only commit.
