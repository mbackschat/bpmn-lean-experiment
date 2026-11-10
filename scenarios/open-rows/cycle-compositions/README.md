# Sequence Flow cycles

Answer-free schedules for [PC-CF-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): explicit Sequence Flow cycles across mixed tasks and a reusable scope, with fresh occurrence identity per iteration and an automatic cycle with no wait. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#cycles) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay. The Service Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`, so its effect waits for an `effectResult` stimulus.

## Models

| Model | What it holds |
|---|---|
| [rework-loop](rework-loop.bpmn) | An Exclusive merge, the Sub-Process *Assess* around the User Task *Inspect damage*, the Service Task *Price repair*, the User Task *Review quote*, and a Choice that returns to the merge on `${decision == 'rework'}`. |
| [automatic-loop](automatic-loop.bpmn) | An Exclusive merge, a plain Task whose output mapping stores `${n + 1}` in `n`, and a Choice that returns to the merge on `${n < limit}` before the User Task *Report*. The cycle holds no wait and no script. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [two-reworks-with-stale-commands](rework-loop-two-reworks-with-stale-commands.scenario.json) | rework-loop | Two rework decisions and a final approval; after each rework the first iteration's *Inspect damage*, *Price repair* and *Review quote* identities are used once again while the later iteration's occurrence is open. |
| [short-burst](automatic-loop-short-burst.scenario.json) | automatic-loop | `limit` is 3, so the automatic cycle runs a few times before *Report*. |
| [long-burst](automatic-loop-long-burst.scenario.json) | automatic-loop | `limit` is 2000, so the automatic cycle runs far more times in one resumption. |
| [beyond-bound](automatic-loop-beyond-bound.scenario.json) | automatic-loop | `limit` is 50000, beyond the row's declared limit, so the kernel refuses the start (`unsupported "closure-bound"`) and commits nothing, where CIB runs the whole burst. |

The row's declared limit is `Step.closureBound`, 100000 micro-steps in one closure, which this model reaches at about 33000 iterations (about three micro-steps an iteration, measured 2026-11-10). The beyond-bound schedule is a long single CIB transaction, so its hosted run is the costliest of the directory.

The schedules carry no expected state; the retained CIB evidence is the answer.
