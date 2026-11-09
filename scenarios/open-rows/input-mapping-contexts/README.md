# Input mapping contexts at every entry

Answer-free schedules for [PC-DATA-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): reusable literal, reference, structured and expression input mappings at Task, Sub-Process, Call and Multi-Instance entry, with captured argument ownership. The [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the rule (all declared inputs read the same pre-entry context; one input cannot consume a newly initialized sibling input; a later write cannot rewrite an open effect's arguments); the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay. The Message-payload and Timer entries of the row's wording are witnessed with their own rows.

The Process variables of every schedule are `first` (`process-first`), `order` (a Map with a nested `customer` Map and a List of two equal line Maps), `quantity` (4) and `seed` (`seed-value`). The input list of each entry has the same seven mappings: `second` (`${first}`), `first` (`${seed}`), a literal, a reference to the whole `order`, a field of it, the expression `${quantity * 2}` and a composite text. `first` is also the name of a Process variable, so the value `second` receives shows which context its mapping read. The entry's observation is its own open task: the task itself, or an *Echo* task inside the Sub-Process or the called Process that publishes each name back as `seen…`.

| Model | Entry |
|---|---|
| [task-entry-inputs](task-entry-inputs.bpmn), [task-entry-inputs-reordered](task-entry-inputs-reordered.bpmn) | User Task *Observe*; the two models declare `second` and `first` in opposite order |
| [scope-entry-inputs](scope-entry-inputs.bpmn) | Sub-Process *Scope* with the task *Echo* inside |
| [call-entry-inputs](call-entry-inputs.bpmn) | Call Activity *Delegate*, whose called Process *Delegate* holds the task *Echo*; the called task is addressed as `call:<length>:Run_1:<length>:CallActivity_Delegate:1` |
| [mi-entry-inputs](mi-entry-inputs.bpmn) | sequential Multi-Instance User Task *Visit* with cardinality `${count}` |
| [captured-snapshot](captured-snapshot.bpmn) | Service Task *Send* (`${bpmnLeanEffectHandler}`, `asyncBefore`) |

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [task-entry-declared-order](task-entry-declared-order.scenario.json) | [task-entry-inputs](task-entry-inputs.bpmn) | A User Task's inputs of literal, reference, field, expression and composite forms, `second` declared before the `first` it reads. | PC-DATA-05 |
| [task-entry-reordered](task-entry-reordered.scenario.json) | [task-entry-inputs-reordered](task-entry-inputs-reordered.bpmn) | The same inputs with `first` declared before the `second` that reads it. | PC-DATA-05 |
| [scope-entry](scope-entry.scenario.json) | [scope-entry-inputs](scope-entry-inputs.bpmn) | The same inputs declared on a Sub-Process, read by the task inside it. | PC-DATA-05 |
| [call-entry](call-entry.scenario.json) | [call-entry-inputs](call-entry-inputs.bpmn) | The same forms as `camunda:in` mappings of a Call Activity, `second` mapped from the name `first` that an earlier mapping fills. | PC-DATA-05 |
| [multi-instance-entry](multi-instance-entry.scenario.json) | [mi-entry-inputs](mi-entry-inputs.bpmn) | A sequential Multi-Instance User Task with a computed input over `loopCounter`, evaluated at each body's entry; the first body is completed so the second opens. | PC-DATA-05 |
| [captured-snapshot](captured-snapshot.scenario.json) | [captured-snapshot](captured-snapshot.bpmn) | A Service Task's expression, structured and plain inputs; a `setVariables` command rewrites all three sources while the effect is open, then the effect returns. | PC-DATA-05 |

Notes for the target runners:

- Gap: List and Map start values, and Map results of an input mapping.
- CIB evaluates an `asyncBefore` Service Task's inputs when its job runs, so *captured-snapshot* compares arguments and sources only where the job runs before the `setVariables` command commits.
- The Call Activity mappings include `sourceExpression`, a literal and an expression form.
