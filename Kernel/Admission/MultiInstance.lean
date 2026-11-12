module

public import Kernel.IL.Types

/-! # Admission of Multi-Instance loop characteristics. A refusal carries a stable code.

`Kernel.Feature.MultiInstance` runs one instance per item of an input collection, or per count of a cardinality,
read once on entry; it gives each instance its item as the input data item and takes the output data item, if any,
from each completion; it applies no other data mapping to an instance. Under the standards profile the collection is a
variable read and the completion condition Simple Boolean; under `Evaluator.juel` the
[Multi-Instance level](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level) admits JUEL, a
variable read and text at all three sites, which `Kernel.Admission.Data.loopExpression` checks. Which work an instance
may do is admitted by `Kernel.Admission.Work`.
-/

public section

namespace Kernel.Admission.MultiInstance

/-- A count under the standards profile: a variable-read collection; Simple Boolean expresses no Integer, so a
cardinality is refused. -/
def standardCount : InstanceCount → Option String
  | .collection (.variable _) => none
  | .collection (.literal _) => some "multiInstance.collectionExpression"
  | .collection (.simpleBoolean _) => some "multiInstance.collectionExpression"
  | .collection (.juel _) => some "expression.outsideSimpleBoolean"
  | .collection (.foreign _ _) => some "expression.outsideSimpleBoolean"
  | .cardinality _ => some "multiInstance.cardinality"
  | .countAndCollection _ _ => some "multiInstance.countAndCollection"

def standardCondition : Expression → Option String
  | .simpleBoolean _ => none
  | .literal _ => some "multiInstance.completionConditionExpression"
  | .variable _ => some "multiInstance.completionConditionExpression"
  | .juel _ => some "expression.outsideSimpleBoolean"
  | .foreign _ _ => some "expression.outsideSimpleBoolean"

/-- A count under `Evaluator.juel`, each expression checked by `juel`. -/
def juelCount (juel : Bool → Expression → Option String) : InstanceCount → Option String
  | .collection items => juel false items
  | .cardinality count => juel false count
  | .countAndCollection _ _ => some "multiInstance.countAndCollection"

/-- Whether the loop runs its instances at once, not one after another (BPMN 2.0.2 §13.3.7). -/
def runsAtOnce (loop : MultiInstance) : Bool := loop.mode == .parallel

/-- A sequential loop whose collection is `.juel`, which CIB re-evaluates before every later instance (PC-MI-08). -/
def rereads (loop : MultiInstance) : Bool :=
  !runsAtOnce loop && match loop.count with
    | .collection (.juel _) => true
    | .collection _ => false
    | .cardinality _ => false
    | .countAndCollection _ _ => false

/-- An instance's result, given whether its work submits the output data item (`Kernel.Admission.Work.instanceBody`):
a User Task's submission fills it, except that a submission installing variables (CIB-EXT-0005) needs none, since
CIB's `TaskService.complete` sets each value through the instance's task execution; a Service Task's empty OutputSet
fills neither an output data item nor an output collection, which body result effects (PC-MI-10) would. -/
def instanceResult (submission : SubmissionRule) (submits : Bool) (loop : MultiInstance) : Option String :=
  if submits then
    if loop.outputDataItem.isNone && submission == .outputSet then some "multiInstance.outputDataItem" else none
  else if loop.outputDataItem.isSome || loop.outputCollection.isSome then some "multiInstance.instanceResult"
  else none

/-- Whether `camunda:elementVariable` is refused: under the standards binding it is a foreign extension; under
`loopReferences` it names the item local (CIB-INT-0014, `BpmnParse.java:1863-1866`) unless the loop also has an
`inputDataItem`, whose `name` CIB sets over it (`:1868-1873`) even when absent, which the IL cannot tell from no item. -/
def elementVariableRefused (options : ProfileOptions) (loop : MultiInstance) : Bool :=
  loop.elementVariable.isSome && match options.multiInstanceBinding with
    | .dataAssociations => true
    | .loopReferences => loop.inputDataItem.isSome || loop.inputDataItemName.isSome

/-- Whether `id` or an element enclosing it has Multi-Instance loop characteristics, so a site there runs inside an
instance. A called process's elements stop at its level: the called instance holds no caller's counter. -/
def inInstance (program : Program) : Nat → Option ElementId → Bool
  | 0, _ => false
  | _, none => false
  | fuel + 1, some id =>
    let element := program.element? id
    (element.bind (·.envelope?) |>.bind (·.multiInstance)).isSome ||
      inInstance program fuel (element.bind (·.header.parent))

/-- Whether the counter names are variables at a site in `id`'s scope: inside an instance under
`MultiInstanceCounters.cibLocals`, where CIB holds them as the instance's and the body's locals
(`MultiInstanceActivityBehavior:196-198`). The innermost loop's counters hide an enclosing loop's. -/
def countersAt (program : Program) (id : Option ElementId) : Bool :=
  program.options.multiInstanceCounters == .cibLocals && inInstance program program.elements.length id

/-- The instance names a looping Activity's own input mappings may not read under `loopReferences`: the counters and
the item. CIB evaluates them in the parent of the execution entering the Activity (`IoParameter.java:50-51`, run by
`PvmExecutionImpl.java:1309-1314`), a choice that depends on whether the inner Activity is a scope and that its source
marks legacy; such a read rolls the start back where BPMN 2.0.2 gives each instance its item (CIB-LIM-0019). The
standards binding keeps every own input mapping refused (`multiInstance.mappings`). -/
def ownInputNames (options : ProfileOptions) (loop : MultiInstance) : List String :=
  match options.multiInstanceBinding with
  | .dataAssociations => []
  | .loopReferences => multiInstanceCounterNames ++ (loop.inputDataItemName <|> loop.elementVariable).toList

/-- A mapping, output or result target named like a counter inside an instance, which would overwrite CIB's counter
local (`MultiInstanceActivityBehavior:196-198`) before its next typed read (`:200-204`); `counters` is `countersAt` of
the scope the targets are written in (CIB-LIM-0020). A write no admission sees stays dynamic
(`multiInstance.resultShadowsInstance`). -/
def counterTarget (counters : Bool) (targets : List String) : Option String :=
  if counters && targets.any multiInstanceCounterNames.contains then some "multiInstance.counterTarget" else none

/-- The names a loop writes into scope occurrences of its own, which no sibling branch can read: the counters and each
instance's input and output items; only the output collection reaches the enclosing scope. -/
def loopLocals (loop : MultiInstance) : List String :=
  multiInstanceCounterNames ++ loop.elementVariable.toList ++ loop.inputDataItem.toList ++ loop.inputDataItemName.toList ++
    loop.outputDataItem.toList

/-- Whether a loop may run no instance, which completes its element in the closure that begins it: anything but a
literal positive cardinality, since a collection may be empty and a computed count zero. -/
def mayRunNone (loop : MultiInstance) : Bool :=
  match loop.count with
  | .cardinality (.literal (.int count)) => count ≤ 0
  | .cardinality _ => true
  | .collection _ => true
  | .countAndCollection _ _ => true

/-- Under `BranchSchedule.orderInvariant`, the instances of a parallel loop may not race one another in the closure that
begins them (`Kernel.Admission.Flow.instanceClosure`): BPMN 2.0.2 §13.3.7 fixes no order among them, which
`Kernel.Feature.MultiInstance` leaves to the closure's first-in, first-out queue, so a name an instance writes there,
or which instance's completion first satisfies the completion condition and cancels the rest, would depend on an order
no input states. `races` and `completes` count conservatively, as `flow.concurrentWrite` does: an instance's write to
its own item counts, and so does any completion path. A forward-compatible restriction; CIB's `declarationDepthFirst`
runs instance 0 first (CIB-OP-0016). A User, Service or Receive Task instance waits, so its loop is admitted. -/
def concurrentInstances (options : ProfileOptions) (loop : MultiInstance) (races completes : Bool) : Option String :=
  let unordered := match options.branchSchedule with
    | .orderInvariant => runsAtOnce loop
    | .declarationDepthFirst => false
  if unordered && (races || (loop.completionCondition.isSome && completes)) then
    some "multiInstance.concurrentInstances"
  else none

/-- `submits` is `none` for work no instance may do, which `Kernel.Admission.Work` refuses. Under the CIB counters an
item named like a counter is refused: CIB sets both on one execution, so one overwrites the other. A collection loop
needs its input data item, or an admitted element variable; a cardinality loop sets none
(`MultiInstanceActivityBehavior:85`). Own input mappings are admitted under `loopReferences`, whose reads
`ownInputNames` restricts and whose targets `counterTarget` does; own output mappings are a CIB deployment error
(`BpmnParse.java:4855-4857`). -/
def activityLoop (options : ProfileOptions) (juel : Bool → Expression → Option String) (submits : Option Bool)
    (envelope : Envelope) (loop : MultiInstance) : Option String :=
  let underJuel := options.evaluator == .juel
  let counters := options.multiInstanceCounters == .cibLocals
  let collection := match loop.count with
    | .collection _ => true
    | .cardinality _ => false
    | .countAndCollection _ _ => true
  (if underJuel then juelCount juel loop.count else standardCount loop.count) <|>
    (loop.completionCondition.bind fun condition =>
      if underJuel then juel counters condition else standardCondition condition) <|>
    if elementVariableRefused options loop then some "multiInstance.elementVariable"
    else if loop.mutableCollection == .sequentialReread || (underJuel && rereads loop) then some "multiInstance.mutableCollection"
    else if collection && loop.inputDataItem.isNone && loop.elementVariable.isNone then some "multiInstance.inputDataItem"
    else if counters && [loop.inputDataItem, loop.inputDataItemName, loop.elementVariable].any
        (·.any multiInstanceCounterNames.contains) then
      some "multiInstance.itemNamedLikeCounter"
    else (submits.bind (instanceResult options.submission · loop)) <|>
      if !envelope.outputs.isEmpty || (!envelope.inputs.isEmpty && (ownInputNames options loop).isEmpty) then
        some "multiInstance.mappings"
      else counterTarget counters (envelope.inputs.map (·.target))

end Kernel.Admission.MultiInstance
