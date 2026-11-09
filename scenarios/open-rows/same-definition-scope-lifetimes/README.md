# Repeated and concurrent activations of one embedded Sub-Process

This directory serves [PC-SCOPE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): two live occurrences of one embedded definition and a later re-entry, with their locals, tasks and effects. The [review model](review-lanes.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The registered [concurrent embedded activations](../../concurrent-embedded-activations/README.md) and [scope re-entry](../../scope-reentry/README.md) scenarios hold the earlier shapes.

After a Parallel fork, the Human Tasks `IntakeNorth` and `IntakeSouth` both lead to an identity-only converging Exclusive Gateway that enters the Sub-Process `Review`, so each intake task starts its own activation; the Human Task `Outside` runs beside them. `Review` declares the locals `status` (literal `open`) and `note` (`${seed}`, read at entry), and runs the Human Task `Examine`, the Service Task `Notify` (answered by `effectResult`) and the Human Task `Sign`; `Examine` and `Sign` publish `seenStatus` and `seenNote`. After `Review`, the Human Task `Publish` writes the Boolean `again`, which a diverging Exclusive Gateway sends back to the converging gateway when true. Start variables are `seed = "s0"` and `again = false`.

Activations count per element from 1 in the order they begin, so the north intake's occurrence holds the first `Examine` and the south intake's the second whenever north completes first. The CIB runner can number an asynchronous effect only while one of that element is pending, so every schedule answers each `Notify` before the next one begins.

| Schedule | Case it exercises |
|---|---|
| [interleaved-live-occurrences](interleaved-live-occurrences.scenario.json) | `seed` is changed between the two intake completions, then the occurrences cross: south `Examine` and `Notify` before north's, each `Sign` and `Publish` in turn, and `Outside` last. |
| [reentry-while-other-live](reentry-while-other-live.scenario.json) | The north occurrence runs to `Publish` with `again = true` while the south occurrence waits at `Examine`; the first `Sign` is addressed again, and the re-entered occurrence and the south occurrence then proceed in turn. |
| [cross-addressed-and-stale-completions](cross-addressed-and-stale-completions.scenario.json) | A `Sign` and a `Notify` are addressed that the other occurrence owns or that already completed, between the two occurrences' own steps. |

The schedules carry no expected route, local, open wait or Process state; the retained CIB evidence is the answer.
