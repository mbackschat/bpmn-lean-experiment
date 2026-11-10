# Inclusive join activation

Answer-free schedules for [PC-CF-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Inclusive join whose readiness changes without a token arriving at it, a join input that only a Boundary Event's flow reaches, and a join nested in one branch of an Inclusive join, which must fire the outer join once. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#inclusive-join-activation-and-reach) state the standards reading, CIB's reading and the expected results of both; these inputs only exercise them. The CIB Seven `2.2.0` answer, pending, will decide the reach (CIB-INT-0020), with `parked-then-escalated` the deciding schedule; where it shows CIB's arrival-only trigger, it is owned by the candidate deviation CIB-DEV-0002. The profile is `cibseven-2.2.0` with no source overlay; every wait is a User Task, except the Service Task *Check B* of `raised-path`, and each Boundary Event is an interrupting Message Boundary Event addressed by its occurrence.

## Models

| Model | What it holds |
|---|---|
| [boundary-exit](boundary-exit.bpmn) | A Parallel fork over *Review A* and *Review B*, which both reach the Inclusive join *Reviewed* before *Decide*; the Message Boundary Event *Withdrawn* on *Review B* ends in its own None End. |
| [boundary-path](boundary-path.bpmn) | The same fork; *Review B* completes into its own None End, and only its Message Boundary Event *Escalated* reaches the join. |
| [nested-inclusive](nested-inclusive.bpmn) | A Parallel fork over *Review A* and the fork *Split B* over *Review B1* and *Review B2*; the Inclusive *Inner join* joins B1 and B2 before the Inclusive *Outer join*, which also takes *Review A*, opens *Decide*. The inner join is declared first. |
| [nested-inclusive-outer-first](nested-inclusive-outer-first.bpmn) | The same with *Outer join* declared first. |
| [nested-parallel](nested-parallel.bpmn), [nested-parallel-outer-first](nested-parallel-outer-first.bpmn) | The same two orders with a Parallel *Inner join*. |
| [nested-skip](nested-skip.bpmn), [nested-skip-outer-first](nested-skip-outer-first.bpmn) | The Inclusive pair, where *Review B2* passes the Exclusive *Skip check*, whose flow conditioned on `${skip}` ends at *B2 skipped* and whose default reaches *Inner join*. |
| [raised-path](raised-path.bpmn) | A Parallel fork over *Review A* and the Service Task *Check B*, which both reach the Inclusive join *Reviewed* before *Decide*; no Error catch is modeled. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [parked-then-withdrawn](boundary-exit-parked-then-withdrawn.scenario.json) | boundary-exit | *Review A* has arrived at the join, then *Review B* is withdrawn, so no token can reach the join's empty input. |
| [withdrawn-then-parked](boundary-exit-withdrawn-then-parked.scenario.json) | boundary-exit | The withdrawal comes before *Review A* completes. |
| [parked-then-closed](boundary-path-parked-then-closed.scenario.json) | boundary-path | *Review A* has arrived at the join while *Review B*'s Boundary Event can still reach it; then *Review B* completes into its own End. |
| [parked-then-escalated](boundary-path-parked-then-escalated.scenario.json) | boundary-path | *Review A* has arrived at the join, then *Escalated* fires and its token reaches the join's other input. |
| [closed-then-parked](boundary-path-closed-then-parked.scenario.json) | boundary-path | *Review B* completes into its own End before *Review A* completes. |
| [a-then-inner](nested-inclusive-a-then-inner.scenario.json), [outer first](nested-inclusive-outer-first-a-then-inner.scenario.json), [parallel](nested-parallel-a-then-inner.scenario.json), [parallel outer first](nested-parallel-outer-first-a-then-inner.scenario.json) | nested-* | *Review A* reaches *Outer join*, then *Review B1* and *Review B2* reach *Inner join*, whose firing must open *Decide* exactly once. |
| [a-then-skipped](nested-skip-a-then-skipped.scenario.json), [outer first](nested-skip-outer-first-a-then-skipped.scenario.json) | nested-skip, nested-skip-outer-first | `skip` is true: after *Review A* and *Review B1*, *Review B2* ends at *B2 skipped*, so *Inner join* becomes ready without an arrival, and *Decide* must open once. |
| [parked-then-failed](raised-path-parked-then-failed.scenario.json) | raised-path | *Review A* has arrived at the join, then *Check B*'s effect fails with the uncaught business Error `UNHANDLED`, which ends its path without an outflow (CIB-INT-0013). |

The schedules carry no expected state; the CIB evidence, once retained, is the answer.
