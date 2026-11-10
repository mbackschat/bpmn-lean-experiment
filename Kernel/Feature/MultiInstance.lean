module

public import Kernel.Hooks

/-! # Multi-Instance Activities

Owns matching on `MultiInstanceMode` and the Multi-Instance body. A token reaching an Activity with Multi-Instance
loop characteristics begins the body's occurrence, evaluates the input collection once and, for a nonempty collection,
enters the body's scope occurrence, which is the host its boundaries attach to. Each instance runs in a scope
occurrence of its own holding its input data item, as an occurrence of the Activity that `Kernel.Feature.Work` runs
like any other. A parallel Activity begins every instance at once, a sequential one the next after each completion
([BPMN 2.0.2 §13.3.7](../../docs/reference/bpmn-2.0.2/README.md)).

The resolutions of the [parallel](../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md)
and [sequential](../../docs/kernel/semantics/MULTI-INSTANCE-SEMANTICS-SPEC.md) Multi-Instance accounts:
an instance's completion submits exactly its output data item, which fills the instance's slot whatever the
completion order; the output collection, in item order, is written only when every slot is filled (`PMI-FINISH-01`);
a completion condition that holds before then closes the Activity, ending the remaining instances, with no output
collection (`PMI-EARLY-01`); an empty collection completes at once with an empty output collection. An interrupting
boundary leaves the occurrence with every instance in it and writes nothing (`PMI-TIMER-01`).
-/

public section

namespace Kernel.Feature.MultiInstance

/-- The instances to begin now: every waiting one in parallel, else the first waiting one once none runs. -/
def opening (mode : MultiInstanceMode) (instances : List Iteration) : List Nat :=
  let waiting := (instances.zipIdx.filterMap fun (slot, index) =>
    match slot with
    | .waiting => some index
    | .active _ => none
    | .completed _ => none)
  let running := instances.any fun
    | .active _ => true
    | .waiting => false
    | .completed _ => false
  match mode with
  | .parallel => waiting
  | .sequential => if running then [] else waiting.take 1

def filled : Iteration → Bool
  | .completed _ => true
  | .waiting => false
  | .active _ => false

def output? : Iteration → Option Value
  | .completed output => output
  | .waiting => none
  | .active _ => none

/-- The collection a loop reads under the profile's binding: the Data Association reading the reader folds into
`count`, or the variable `loopDataInputRef` names (CIB-INT-0014, `BpmnParse#parseMultiInstanceLoopCharacteristics`),
which a loop without that element, given by `camunda:collection`, does not have. -/
def collectionOf (ctx : Ctx) (loop : MultiInstance) (items : Expression) : Expression :=
  match ctx.program.options.multiInstanceBinding, loop.loopDataInputRef with
  | .loopReferences, some name => .variable name
  | .loopReferences, none => items
  | .dataAssociations, _ => items

/-- The local each instance holds its item in under the profile's binding: the Data Input the item's association
feeds, or the `inputDataItem`'s `name`, none when it has no name (CIB-INT-0014). -/
def itemName (ctx : Ctx) (loop : MultiInstance) : Option String :=
  match ctx.program.options.multiInstanceBinding with
  | .dataAssociations => loop.inputDataItem
  | .loopReferences => loop.inputDataItemName

def runOf? (state : State) (body : Nat) : Option MultiInstanceRun :=
  state.slots.multiInstances.find? (·.occurrence == body)

def setRun (state : State) (run : MultiInstanceRun) : State :=
  let runs := state.slots.multiInstances
  let runs := if runs.any (·.occurrence == run.occurrence) then runs.map (fun other => if other.occurrence == run.occurrence then run else other)
    else runs ++ [run]
  { state with slots := { state.slots with multiInstances := runs } }

/-- Begin the instances `opening` names, each in a scope occurrence holding its input data item. -/
def beginInstances (ctx : Ctx) (loop : MultiInstance) (items : List Value) (run : MultiInstanceRun) (state : State) :
    State :=
  let (state, instances) := (opening loop.mode run.instances).foldl (fun (state, instances) index =>
    let locals := match itemName ctx loop, items[index]? with
      | some name, some value => [(name, value)]
      | _, _ => []
    let (state, scope) := state.enterScope run.element run.scope locals none
    (state.signal (.begin { element := run.element, scope, continuation := .multiInstance run.occurrence }),
      instances.set index (.active scope))) (state, run.instances)
  setRun state { run with instances }

/-- The output collection of `outputs` in the form of the input collection: a String List of Strings, else a
List. -/
def outputCollection (collection : Value) (outputs : List Value) : Value :=
  match collection with
  | .stringList _ => .stringList (outputs.filterMap fun
    | .string text => some text
    | .null => none
    | .bool _ => none
    | .int _ => none
    | .decimal _ _ => none
    | .stringList _ => none
    | .list _ => none
    | .map _ => none)
  | .list _ => .list outputs
  | .null => .list outputs
  | .bool _ => .list outputs
  | .int _ => .list outputs
  | .decimal _ _ => .list outputs
  | .string _ => .list outputs
  | .map _ => .list outputs

/-- The output collection a filled body writes: BPMN 2.0.2 §13.3.7 aggregates; CIB-LIM-0001 selects none. -/
def written (ctx : Ctx) (loop : MultiInstance) (collection : Value) (outputs : List Value) : List (String × Value) :=
  match ctx.program.options.multiInstanceOutputs, loop.outputCollection with
  | .aggregates, some name => [(name, outputCollection collection outputs)]
  | .aggregates, none => []
  | .none, _ => []

/-- `Hooks.arriveMultiInstance`. An unavailable input collection holds the occurrence, as an unavailable InputSet
does ([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)). -/
def arriveMultiInstance (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance)
    (occurrence : Occurrence) (state : State) : Outcome := do
  let source ← match loop.count with
    | .collection items => .ok (collectionOf ctx loop items)
    -- Admission refuses it (`multiInstance.cardinality`).
    | .cardinality _ => .error (.unsupported "multi-instance-cardinality")
  match ctx.evaluate (state.evalContext occurrence.scope) source with
  | .unsupported code => .error (.unsupported code)
  | .failure _ =>
    let some flow := occurrence.incoming | .error (.semanticFailure "multi-instance-without-flow")
    .ok (state.hold { occurrence := occurrence.id, flow, scope := occurrence.scope })
  | .value collection =>
    let run : MultiInstanceRun :=
      { scope := State.root, element := header.id, occurrence := occurrence.id, collection, instances := [] }
    match run.items with
    | none => .error (.semanticFailure "multi-instance-collection")
    | some [] => .ok (state.signal (.complete occurrence.id .outgoing (written ctx loop collection []) .outward))
    | some items =>
      let (state, scope) := state.enterScope header.id occurrence.scope [] (some occurrence.id)
      let state := if envelope.boundaries.isEmpty then state
        else state.signal (.arm occurrence.id header.id occurrence.scope)
      .ok (beginInstances ctx loop items
        { run with scope, instances := items.map fun _ => .waiting } state)

/-- An instance's output, kept as a String when the input collection is a String List, whose output collection holds
Strings only; a loop without an output data item takes the empty OutputSet. `Kernel.Feature.Work` has checked a User
Task's submission is exactly the output data item. -/
def submitted (loop : MultiInstance) (run : MultiInstanceRun) (writes : List (String × Value)) :
    Except Failure (Option Value) :=
  match loop.outputDataItem, writes with
  | none, [] => .ok none
  | some _, [(_, value)] =>
    match run.collection, value with
    | .stringList _, .string _ => .ok (some value)
    | .stringList _, _ => .error (.rejected "instance-output-kind")
    | _, _ => .ok (some value)
  | _, _ => .error (.rejected "undeclared-output")

/-- The body is done: complete it, writing the output collection when every slot is filled. -/
def finish (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (state : State) : State :=
  let writes := if run.instances.all filled then written ctx loop run.collection (run.instances.filterMap output?)
    else []
  state.signal (.complete run.occurrence .outgoing writes .outward)

def loopOf? (ctx : Ctx) (run : MultiInstanceRun) : Option MultiInstance :=
  ((ctx.program.element? run.element).bind (·.envelope?)).bind (·.multiInstance)

/-- `Hooks.completeBody`: an idle body has nothing more to run. -/
def completeBody (ctx : Ctx) (_ : Header) (_ : Envelope) (loop : MultiInstance) (occurrence : Occurrence)
    (state : State) : Outcome :=
  match runOf? state occurrence.id with
  | none => .error (.semanticFailure "body-without-multi-instance")
  | some run => .ok (finish ctx loop run state)

/-- Whether the final completion evaluates the completion condition: BPMN 2.0.2 §13.3.7 evaluates on every completion;
CIB tests exhaustion first in sequential mode and the condition first in parallel mode (CIB-INT-0009,
`SequentialMultiInstanceActivityBehavior:53`, `ParallelMultiInstanceActivityBehavior:96`). -/
def evaluatesFinalCondition (ctx : Ctx) (loop : MultiInstance) : Bool :=
  match ctx.program.options.multiInstanceFinalBody, loop.mode with
  | .conditionEveryCompletion, .sequential => true
  | .conditionEveryCompletion, .parallel => true
  | .modeSpecific, .parallel => true
  | .modeSpecific, .sequential => false

/-- `Hooks.instanceCompleted`: fill the instance's slot, leave its scope occurrence, then finish, close early or
continue. -/
def instanceCompleted (ctx : Ctx) (body : Nat) (occurrence : Occurrence) (writes : List (String × Value))
    (state : State) : Outcome := do
  let some run := runOf? state body | .error (.semanticFailure "instance-without-multi-instance")
  let some loop := loopOf? ctx run | .error (.semanticFailure "instance-without-loop")
  let some index := run.instances.findIdx? (fun
      | .active scope => scope == occurrence.scope
      | .waiting => false
      | .completed _ => false)
    | .error (.semanticFailure "instance-without-slot")
  let output ← submitted loop run writes
  let run := { run with instances := run.instances.set index (.completed output) }
  let state := setRun (state.leaveScope occurrence.scope) run
  let exhausted := run.instances.all filled
  if exhausted && !evaluatesFinalCondition ctx loop then .ok (finish ctx loop run state)
  else
    let stop ← match loop.completionCondition with
      | none => .ok false
      | some condition =>
        match ctx.evaluate (state.evalContext run.scope) condition with
        | .value (.bool holds) => .ok holds
        | .value _ => .error (.semanticFailure "completion-condition-not-boolean")
        | .failure code => .error (.semanticFailure code)
        | .unsupported code => .error (.unsupported code)
    if stop || exhausted then .ok (finish ctx loop run state)
    else
      let some items := run.items | .error (.semanticFailure "multi-instance-collection")
      .ok (beginInstances ctx loop items run state)

end Kernel.Feature.MultiInstance
