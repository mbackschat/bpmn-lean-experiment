# Branch fan-out order

Answer-free models for [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (declaration permutation) under the [standards profile](../../../profiles/bpmn-2.0.2/README.md): one command or start queues several units of work at once, through a mechanism other than a split's own branches, and the value left behind or the work still open would depend on the order the closure runs them. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#arrival-and-leaving) own the meaning: BPMN leaves that order open (§13.3.1, Table 13.1), so `BranchSchedule.orderInvariant` refuses such a model at deployment (`flow.concurrentWrite`, `flow.concurrentInterference`, and `multiInstance.concurrentInstances` for the instances of one parallel Multi-Instance body) and that refusal is the answer; the controls are admitted. The [split branch order](../split-branch-order/README.md) witnesses hold the plain split. The models are project-authored MIT source and select no CIB oracle, so the Lean kernel is the authority the TypeScript kernel is checked against; neither refusal applies under CIB's schedule (`declarationDepthFirst`, CIB-OP-0016), which fixes the order. Each writer is an automatic Sub-Process whose output parameter writes a literal into `outcome` (CIB-EXT-0031).

## Models

| Model | Mechanism | What it holds |
|---|---|---|
| [esp-wake-pair](esp-wake-pair.bpmn) | Signal broadcast | After the User Task *Fire*, the Signal throw *Throw* starts two non-interrupting Event Sub-Processes, *Esp_One* and *Esp_Two*, each writing its own value. |
| [esp-wake-pair-swapped](esp-wake-pair-swapped.bpmn) | Signal broadcast | The same with the two Event Sub-Processes declared in the other order. |
| [throw-vs-wake](throw-vs-wake.bpmn) | Signal broadcast | *Throw* continues to a writer while the Event Sub-Process it starts writes too. |
| [signal-end-scope](signal-end-scope.bpmn) | Signal broadcast | The Signal End *Signalled* ends the Sub-Process *Region*, whose completion leads to a writer, while the Event Sub-Process it starts writes too. |
| [terminate-resumption](terminate-resumption.bpmn) | Signal broadcast | A Parallel fork opens the catch *Caught*, leading to a Terminate End, beside *Fire*; *Throw* resumes *Caught* while its own continuation writes. |
| [escalation-vs-thrower](escalation-vs-thrower.bpmn) | Non-interrupting catch | The Escalation throw *Escalate* inside *Region* continues to a writer while the non-interrupting boundary *Noticed* on *Region* leads to another. |
| [escalation-end-scope](escalation-end-scope.bpmn) | Non-interrupting catch | The Escalation End *Escalated* ends *Region*, whose completion leads to a writer, while *Noticed* leads to another. |
| [conditional-write](conditional-write.bpmn) | Conditional firing | A Parallel fork holds the User Task *Host*, whose non-interrupting Conditional boundary on `flag` leads to a writer, beside *Fire*, after which *Write_Flag* sets `flag` and a second writer follows. |
| [split-uncaught-error](split-uncaught-error.bpmn) | Uncaught Error | A Parallel fork leads to an Error End no catcher names and to the writer *Work*. |
| [split-uncaught-error-swapped](split-uncaught-error-swapped.bpmn) | Uncaught Error | The same with the fork's flows declared in the other order. |
| [call-error-escapes](call-error-escapes.bpmn) | Uncaught Error from a Call | A Parallel fork leads to the Call Activity *Check*, whose called Process ends at an Error End no catcher names, and to the User Task *Review*. |
| [handlers-together](handlers-together.bpmn) | Compensation | Parallel branches complete the User Tasks *Book_A* and *Book_B*, whose compensation handlers *Undo_A* and *Undo_B* each write; after the join the Compensation throw *Undo* begins both. |
| [handlers-together-subjects-swapped](handlers-together-subjects-swapped.bpmn) | Compensation | The same with *Book_B* declared before *Book_A*. |
| [handlers-across-choice](handlers-across-choice.bpmn) | Compensation | The review's witness: a Parallel fork leads to *Book_A* and *Book_B*; *Book_A* goes on to the Exclusive Gateway *Choose*, whose conditioned flow leads to *Book_B* and whose default to the join, so a path leads from *Book_A* to *Book_B* while *Book_B* may complete first and *Book_A* after it. |
| [handlers-reentered](handlers-reentered.bpmn) | Compensation | Every path to *Book_B* passes *Book_A*, but a Parallel fork sends a second token through the User Task *Review* to *Book_A*, which may complete it again after *Book_B*, before *Wait* leads to the throw. |
| [handlers-returning](handlers-returning.bpmn) | Compensation | One token runs the Sub-Processes *Book_A* and *Book_B*, whose Compensation Event Sub-Processes write; the interrupting Timer boundary *Retry* of the User Task *Check* leads back to *Book_A*, a path through an Activity and a boundary that no Sequence Flow ordering follows. |
| [handlers-in-reentered-scope](handlers-in-reentered-scope.bpmn) | Compensation | *Book_A* and *Book_B* run in the Sub-Process *Region*, which has no handler, inside *Order*; *Retry* on *Check* enters *Region* again, so *Order* gathers the records of two occurrences, which the throw in *Order*'s Compensation Event Sub-Process compensates in one run. |
| [instances-woken-together](instances-woken-together.bpmn) | Signal broadcast to instances | A Parallel fork holds the parallel Multi-Instance Sub-Process *Each* over `items` = [a, b], completing once an instance's `item` is `a`, whose instances wait at the Signal catch *Heard*, beside *Fire*, after which *Throw* resumes every instance in one closure, which completes them in an order no input states. |
| [caught-error-in-branch](caught-error-in-branch.bpmn) | Control | One branch's Error is caught by a boundary on its own Sub-Process; the other branch writes. |
| [single-catch](single-catch.bpmn) | Control | *Throw* resumes one catch in the sibling branch, whose writer is the only one. |
| [interrupting-boundary-around-thrower](interrupting-boundary-around-thrower.bpmn) | Control | *Throw* inside *Region* is caught by an interrupting boundary on *Region*, which removes the thrower's own continuation. |
| [call-error-caught-inside](call-error-caught-inside.bpmn) | Control | The called Process of *Check* catches its own Error with a boundary on its Sub-Process *Attempt*. |
| [handlers-in-sequence](handlers-in-sequence.bpmn) | Control | One token completes *Book_A* and then *Book_B*, so every record of *Book_A* precedes every one of *Book_B* and their handlers never begin together. |

## Schedules

Each model has one schedule, `<model>-start`, that starts one instance; the deployment decides every case, so no further command separates them. The schedules carry no expected result.
