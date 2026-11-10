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

def slotFilled : Iteration → Bool
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

/-- The instances a cardinality value counts (EXPRESSION-SEMANTICS-SPEC "Multi-Instance level", Results); a value the
rule refuses is a `semanticFailure` with the rule's code, which `entryInput` places. Under `integer` only an Integer
counts (BPMN 2.0.2 Table 10.29); under `javaInt` CIB's `resolveLoopCardinality` also parses text and takes an integral
Decimal, at Java's `int` width (CIB-EXT-0033, `MultiInstanceActivityBehavior:145-155`). -/
def countOf (rule : MultiInstanceCount) (value : Value) : Except Failure Nat :=
  let counted (count : Int) : Except Failure Nat :=
    -- Dynamic-only: CIB's `intValue` would keep the low 32 bits.
    if rule == .javaInt && !withinJavaInt count then .error (.unsupported "multiInstance.countRange")
    else if count < 0 then .error (.semanticFailure "multiInstance.negativeCount")
    else .ok count.toNat
  let notANumber : Except Failure Nat := .error (.semanticFailure "multiInstance.notANumber")
  match rule, value with
  | .integer, .int count => counted count
  | .integer, _ => notANumber
  | .javaInt, .int count => counted count
  | .javaInt, .decimal coefficient scale =>
    -- Dynamic-only: CIB's `BigDecimal.intValue` truncates a fraction.
    if coefficient % 10 ^ scale != 0 then .error (.unsupported "multiInstance.fractionalCount")
    else counted (coefficient / 10 ^ scale)
  | .javaInt, .string text =>
    -- Dynamic-only: `Integer.parseInt` reads Unicode digits the kernel does not model.
    if !isAscii text then .error (.unsupported "juel.nonAsciiText")
    else match parseJavaInt? text with
      | some parsed => counted parsed
      | none => notANumber
  | .javaInt, _ => notANumber

/-- One entry input, read before the domain predicate, under the profile's `MultiInstanceInputFailure`
(CIB-INT-0019): `none` when an unavailable input holds the occurrence, as an unavailable InputSet does
([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)), and a value `rule` refuses a semantic failure;
under `rollback` both fail the operation. -/
def entryInput (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (expression : Expression)
    (rule : Value → Except Failure α) : Except Failure (Option α) :=
  let rollback := ctx.program.options.multiInstanceInputFailure == .rollback
  match ctx.evaluate { state.evalContext scope with domainChecked := false } expression with
  | .unsupported code => .error (.unsupported code)
  | .failure code => if rollback then .error (.rolledBack code) else .ok none
  | .value value =>
    match rule value with
    | .ok read => .ok (some read)
    | .error (.semanticFailure code) => .error (if rollback then .rolledBack code else .semanticFailure code)
    | .error failure => .error failure

/-- What an entry reads: the collection, its items and the number of instances; a cardinality loop's collection is
`null` and its instances get no item (`MultiInstanceActivityBehavior:85`). -/
def entryRead (ctx : Ctx) (loop : MultiInstance) (state : State) (scope : ScopeOccurrenceId) :
    Except Failure (Option (Value × List Value × Nat)) :=
  match loop.count with
  | .collection items =>
    let code := if ctx.program.options.multiInstanceInputFailure == .rollback then "multiInstance.notACollection"
      else "multi-instance-collection"
    entryInput ctx state scope (collectionOf ctx loop items) fun collection =>
      match collectionItems collection with
      | some members => .ok (collection, members, members.length)
      | none => .error (.semanticFailure code)
  | .cardinality count =>
    entryInput ctx state scope count fun value => do .ok (.null, [], ← countOf ctx.program.options.multiInstanceCount value)
  -- Admission refuses it (`multiInstance.countAndCollection`).
  | .countAndCollection _ _ => .error (.unsupported "multiInstance.countAndCollection")

/-- `Hooks.arriveMultiInstance`: read the count or collection on entry, then begin the instances. -/
def arriveMultiInstance (ctx : Ctx) (header : Header) (envelope : Envelope) (loop : MultiInstance)
    (occurrence : Occurrence) (state : State) : Outcome := do
  match ← entryRead ctx loop state occurrence.scope with
  | none =>
    let some flow := occurrence.incoming | .error (.semanticFailure "multi-instance-without-flow")
    .ok (state.hold { occurrence := occurrence.id, flow, scope := occurrence.scope })
  | some (collection, _, 0) =>
    .ok (state.signal (.complete occurrence.id .outgoing (written ctx loop collection []) .outward))
  | some (collection, items, count) =>
    let (state, scope) := state.enterScope header.id occurrence.scope [] (some occurrence.id)
    let state := if envelope.boundaries.isEmpty then state
      else state.signal (.arm occurrence.id header.id occurrence.scope)
    let run : MultiInstanceRun :=
      { scope, element := header.id, occurrence := occurrence.id, collection, instances := List.replicate count .waiting }
    .ok (beginInstances ctx loop items run state)

/-- An instance's output, kept as a String when the input collection is a String List, whose output collection holds
Strings only. A loop without an output data item takes the empty OutputSet; what its completion writes are the
instance's result locals (`Kernel.Feature.Work.effectCompletion`). `Kernel.Feature.Work` has checked a User Task's
submission is exactly the output data item. -/
def submitted (loop : MultiInstance) (run : MultiInstanceRun) (writes : List (String × Value)) :
    Except Failure (Option Value) :=
  match loop.outputDataItem, writes with
  | none, _ => .ok none
  | some _, [(_, value)] =>
    match run.collection, value with
    | .stringList _, .string _ => .ok (some value)
    | .stringList _, _ => .error (.rejected "instance-output-kind")
    | _, _ => .ok (some value)
  | _, _ => .error (.rejected "undeclared-output")

/-- The body is done: complete it, writing the output collection when every slot is filled. -/
def finish (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (state : State) : State :=
  let writes := if run.instances.all slotFilled then written ctx loop run.collection (run.instances.filterMap output?)
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

/-- What a completion condition reads: the completing instance's scope occurrence, before it is left, so the item and
the instance's result locals are visible (BPMN 2.0.2 §13.3.7), and under `cibLocals` CIB's counters (CIB-INT-0018):
the instance's zero-based index; the count; the active instances, which CIB never lowers below
1 in sequential mode (`SequentialMultiInstanceActivityBehavior:41`); the completed ones, this one included. -/
def conditionContext (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (index : Nat) (scope : ScopeOccurrenceId)
    (state : State) : EvalContext :=
  let context := state.evalContext scope
  let total := run.instances.length
  let completed := (run.instances.filter slotFilled).length
  let active := if loop.mode == .sequential then 1 else total - completed
  let counters : List (String × Value) := match ctx.program.options.multiInstanceCounters with
    | .none => []
    | .cibLocals => multiInstanceCounterNames.zip [Value.int index, .int total, .int active, .int completed]
  { context with variables := counters ++ context.variables }

/-- Whether the completion condition holds, read in the instance's scope occurrence before it is left. A result named
like a counter or the item, and in sequential mode an earlier instance's result this one did not overwrite, which CIB
keeps on the body, have no kernel reading. A failure fails the operation that reached it, so it follows the stimulus
table (`MultiInstanceActivityBehavior:157-162`). -/
def stops (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (index : Nat) (scope : ScopeOccurrenceId)
    (results : List String) (state : State) : Except Failure Bool :=
  match loop.completionCondition with
  | none => .ok false
  | some condition =>
    -- Dynamic-only: which names an earlier instance's result left depends on the run's effect results.
    if run.results.any (!results.contains ·) then .error (.unsupported "multiInstance.sequentialResultLeftover")
    else
      match ctx.evaluate (conditionContext ctx loop run index scope state) condition with
      | .value (.bool holds) => .ok holds
      | .value _ => .error (.rolledBack "multiInstance.completionNotBoolean")
      | .failure code => .error (.rolledBack code)
      | .unsupported code => .error (.unsupported code)

/-- `Hooks.instanceCompleted`: fill the instance's slot, evaluate the completion condition in the instance's scope
occurrence, leave it, then finish, close early or continue. -/
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
  let results := if loop.outputDataItem.isNone then writes.map (·.1) else []
  let shadows := results.any fun name => multiInstanceCounterNames.contains name || some name == itemName ctx loop
  -- Dynamic-only: an effect result's names are the run's data.
  if shadows then .error (.unsupported "multiInstance.resultShadowsInstance")
  let run := { run with instances := run.instances.set index (.completed output) }
  let exhausted := run.instances.all slotFilled
  let stop ← if exhausted && !evaluatesFinalCondition ctx loop then .ok false
    else stops ctx loop run index occurrence.scope results state
  let run := { run with results := if loop.mode == .sequential then (run.results ++ results).eraseDups else [] }
  let state := setRun (state.leaveScope occurrence.scope) run
  if stop || exhausted then .ok (finish ctx loop run state)
  else .ok (beginInstances ctx loop (run.items.getD []) run state)

end Kernel.Feature.MultiInstance
