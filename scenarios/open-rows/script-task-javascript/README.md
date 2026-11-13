# JavaScript Script Tasks

Answer-free schedules for [PC-AUTO-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-AUTO-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the Script Task with `scriptFormat="javascript"` under the [owner decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#owner-decisions-on-the-path) (a read-only context, no host objects, the result recorded like an effect result), the data transformations it must support and the nearest forbidden accesses. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#script-and-business-rule-tasks) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

A Script Task here carries its script in the model and writes its value to a `camunda:resultVariable`; no schedule supplies a script result. A script reads Process variables by bare name, never through `execution`, except in the probe that does. Every script that returns a number returns an integer, so the retained runner's variable projection can carry it. The numeric inputs are Strings that a script parses.

[script-probes.bpmn](script-probes.bpmn) holds one JavaScript Script Task per probe behind an Exclusive Gateway whose JUEL conditions test the start variable `probe`; all branches merge into the User Task *Inspect result*. The JUEL probe has a model of its own, [script-other-language.bpmn](script-other-language.bpmn), since a refused language refuses the whole model and would hide every other probe. Every schedule starts the Process with `price = "6"`, `quantity = "7"`, `firstName = "ada"`, `lastName = "lovelace"` and its probe, and has no other stimulus.

| Schedule | Probe | Case it separates |
|---|---|---|
| [probe-arithmetic-total](probe-arithmetic-total.scenario.json) | `Total` | The product of two numeric Strings parsed with `parseInt`, into `total`. |
| [probe-text-label](probe-text-label.scenario.json) | `Label` | A String transformation (`toUpperCase` and concatenation) into `fullName`. |
| [probe-other-language-juel](probe-other-language-juel.scenario.json) | `OtherLanguage` | A Script Task whose `scriptFormat` is `juel`, the one language other than JavaScript that CIB runs without an added engine, over the same numeric Strings. |
| [probe-host-mutation](probe-host-mutation.scenario.json) | `MutateHost` | A script that writes a Process variable through the host object `execution`. |
| [probe-randomness](probe-randomness.scenario.json) | `Randomness` | A script that calls `Math.random()` and returns a result that does not depend on its value. |
| [probe-wall-clock](probe-wall-clock.scenario.json) | `WallClock` | A script that calls `Date.now()` and returns a result that does not depend on its value. |
| [probe-unknown-name](probe-unknown-name.scenario.json) | `UnknownName` | A script that reads a name no variable or host binding declares. |
| [probe-thrown-error](probe-thrown-error.scenario.json) | `ThrownError` | A script that throws an `Error`. |

Two models place a Script Task in a scope, one each, so that a refusal of one context hides nothing of the other. In [scoped-script-subprocess.bpmn](scoped-script-subprocess.bpmn) *Apply discount* runs in the Sub-Process *Pricing*, which declares the local `lineTotal` from the String `price`, parses it in the script and copies the result out as `total`. In [scoped-script-body.bpmn](scoped-script-body.bpmn) *Label each body* is a sequential Multi-Instance body with a cardinality of two, whose script reads the body's `loopCounter`. Both start with `price = "100"` and wait in the User Task *Inspect result*.

| Schedule | Case it separates |
|---|---|
| [nested-scope-write](nested-scope-write.scenario.json) | A result written to a Sub-Process local that has no namesake at the root. |
| [multi-instance-body](multi-instance-body.scenario.json) | A body whose result variable each iteration rewrites. |

Notes for the target runners:

- The CIB runner evaluates JavaScript through GraalJS `21.3.12` and JUEL natively, and reports each completed Script Task as an execution of the command that reached it; no schedule supplies a Script's result, which the differential records once with the host evaluator and folds into that command.
- `probe-unknown-name` and `probe-thrown-error` have an engine step that can fail inside the starting command, and `probe-host-mutation` may do so under an engine that denies host access; the runner must record such a step as the command outcome rather than as a harness failure. A failing synchronous script is CIB-EXT-0049's, `execution` and `Java` CIB-LIM-0052's.
- Lost local ownership of an asynchronous script result is not authored: the scenario schema has no input that executes a Script Task's job, and `effectResult` answers delegated effects only.
