# Escalation relayed by a called Process's Event Sub-Process

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a called Process whose own Event Sub-Process (ESP) catches an Escalation and throws it again, a boundary of the Call Activity that names it, and the output mapping that the exceptional return may run more than once. The [relay model](relayed-claim.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The plain Call cases are in [escalation-call-propagation](../escalation-call-propagation/README.md).

The caller runs the Call Activity `ReviewRelayed`, which maps `claim` in as `dossier` and `status` out as `relayedStatus`, with a non-interrupting exact `NEEDS_EXPERT` boundary leading to `ConsultRelayed`. The called Process runs the Human Task `ExamineRelayed`, an Intermediate throw `NEEDS_EXPERT` and the Human Task `ConcludeRelayed`, and declares a non-interrupting ESP for `NEEDS_EXPERT` whose body throws `NEEDS_EXPERT` again. The called instance is addressed by the kernel's derived called-instance identifier.

The [double-pass model](double-pass-claim.bpmn) separates one pass of the Call's output mapping from two ([CIB-EXT-0034](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0034--call-outputs-pass-when-a-raised-error-or-escalation-reaches-the-called-root)). The caller runs the Call Activity `Review`, which maps `claim` in as `dossier` and `status` out as `relayedStatus`, with an interrupting exact `RAISE` boundary leading to `Inspect`. The called Process runs the Human Task `Draft`, an Intermediate throw `RAISE` and an End Event, and declares an interrupting ESP for `RAISE` whose body is the Human Task `Revise` and an Escalation End Event `Relay_Raise` that throws `RAISE` again. `Draft` writes `status = "draft"` and `Revise` writes `status = "revised"`, so each pass reads a different value. The boundary is interrupting so that the Call never completes normally: a normal completion would write `relayedStatus = "revised"` whatever the number of passes.

| Scenario | Case it exercises |
|---|---|
| [relayed-through-callee-handler](relayed-through-callee-handler.scenario.json) | `ExamineRelayed` sets `status` before the throw, which the called Process's ESP catches and throws again toward the Call's boundary. |
| [double-pass-through-root-handler](double-pass-through-root-handler.scenario.json) | `claim = "CLM-1"`; `Draft` completes with `status = "draft"`, then `Revise` completes with `status = "revised"`. No evidence yet. |

The schedules carry no expected route, mapped variable or Process state; the retained CIB evidence is the answer. What each reading of the double-pass schedule predicts, observed in the caller's variables after each step:

| Reading | After `Draft` completes | After `Revise` completes |
|---|---|---|
| The output mapping passes each time the raise reaches the called root (CIB-EXT-0034): once for the main path's throw, once for the ESP's rethrow | `relayedStatus = "draft"`, `Revise` open | `relayedStatus = "revised"`, the Call cancelled, `Inspect` open |
| Only the first reach passes | `relayedStatus = "draft"`, `Revise` open | `relayedStatus = "draft"`, `Inspect` open |
| The mapping runs only on the Call's normal completion (the standards reading) | no `relayedStatus`, `Revise` open | no `relayedStatus`, the Call cancelled, `Inspect` open |
