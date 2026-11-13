# Sequence Flow cycles

Answer-free schedules for [PC-CF-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): explicit Sequence Flow cycles across mixed tasks and a reusable scope, with fresh occurrence identity per iteration and an automatic cycle with no wait. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#cycles) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay. The Service Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`, so its effect waits for an `effectResult` stimulus.

## Models

| Model | What it holds |
|---|---|
| [rework-loop](rework-loop.bpmn) | An Exclusive merge, the Sub-Process *Assess* around the User Task *Inspect damage*, the Service Task *Price repair*, the User Task *Review quote*, and a Choice that returns to the merge on `${decision == 'rework'}`. |
| [automatic-loop](automatic-loop.bpmn) | An Exclusive merge, a plain Task whose output mapping stores `${n + 1}` in `n`, and a Choice that returns to the merge on `${n < limit}` before the User Task *Report*. The cycle holds no wait and no script. |
| [automatic-loop-tail](automatic-loop-tail.bpmn) | The automatic-loop cycle, whose exit passes a Choice that runs no, one or two plain Tasks on `${tail == 1}` and `${tail == 2}` before *Report*, so a start's micro-step count can be set one at a time. |
| [automatic-loop-waiting-branch](automatic-loop-waiting-branch.bpmn) | The automatic-loop cycle, whose return passes a Parallel Gateway that also starts a User Task *Review*, so every iteration leaves one more open wait. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [two-reworks-with-stale-commands](rework-loop-two-reworks-with-stale-commands.scenario.json) | rework-loop | Two rework decisions and a final approval; after each rework the first iteration's *Inspect damage*, *Price repair* and *Review quote* identities are used once again while the later iteration's occurrence is open. |
| [short-burst](automatic-loop-short-burst.scenario.json) | automatic-loop | `limit` is 3, so the automatic cycle runs a few times before *Report*. |
| [long-burst](automatic-loop-long-burst.scenario.json) | automatic-loop | `limit` is 2000, so the automatic cycle runs far more times in one resumption. |
| [beyond-bound](automatic-loop-beyond-bound.scenario.json) | automatic-loop | `limit` is 50000, beyond the row's declared limit, so the kernel refuses the start (`unsupported "closure-bound"`) and commits nothing, where CIB runs the whole burst. |
| [tail-at-closure-bound](automatic-loop-tail-at-closure-bound.scenario.json) | automatic-loop-tail | `limit` 33331 and `tail` 2 make the start's closure exactly `Step.closureBound` micro-steps, so it commits. |
| [tail-beyond-closure-bound](automatic-loop-tail-beyond-closure-bound.scenario.json) | automatic-loop-tail | `limit` 33332 and `tail` 0 make it one micro-step longer, so the kernel refuses the start (`unsupported "closure-bound"`). |
| [waiting-branch-at-work-bound](automatic-loop-waiting-branch-at-work-bound.scenario.json) | automatic-loop-waiting-branch | `limit` 1413 keeps the closure's scanned state entries within `Step.closureWorkBound`, so the start commits with 1412 open *Review* tasks. |
| [waiting-branch-beyond-work-bound](automatic-loop-waiting-branch-beyond-work-bound.scenario.json) | automatic-loop-waiting-branch | `limit` 1414 is the first iteration count whose closure scans more, so the kernel refuses the start (`unsupported "closure-bound"`) far below the micro-step bound. |

The row's declared limit is `Step.closureBound`, 100000 micro-steps in one closure, which this model reaches at about 33000 iterations (about three micro-steps an iteration, measured 2026-11-10). The beyond-bound schedule is a long single CIB transaction, so its hosted run is the costliest of the directory. The automatic-loop-tail model takes 3 micro-steps an iteration, 5 around the cycle and `tail` after it (measured 2026-11-13), so its two schedules are one micro-step apart across the bound. The work bound pair is the boundary between two iteration counts, since one iteration adds a growing number of scanned entries. Both pairs carry retained CIB evidence (Verify run 43370273960): the at-bound schedules agree, and CIB commits the beyond-bound ones, which [CIB-LIM-0016](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0016-pinned-cib-runs-an-automatic-burst-beyond-the-kernels-closure-limit) owns.

The schedules carry no expected state; the retained CIB evidence is the answer.
