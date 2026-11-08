module

public import Kernel.Hooks

/-! # Multi-Instance Activities

Owns matching on `MultiInstanceMode`. A token reaching an Activity with Multi-Instance loop characteristics
evaluates the input collection once and, for a nonempty collection, enters a scope occurrence of the Activity that
holds its instances and is the host its boundaries attach to; each instance is the item `Ctx.bodyWait` names, opened
in that occurrence. A parallel Activity opens every instance at once, a sequential one the next after each
completion ([BPMN 2.0.2 §13.3.7](../../docs/reference/bpmn-2.0.2/README.md)). Instances are numbered by the
Activity's element like any occurrence of it; the Activity's own activations are counted apart
(`MultiInstances.entered`), as the retained baselines publish them (`parallel-multi-instance-all`).

The resolutions of the [parallel](../../docs/capsules/PARALLEL-MULTI-INSTANCE-SPEC.md#normative-account-and-selected-resolutions)
and [sequential](../../docs/capsules/SEQUENTIAL-MULTI-INSTANCE-SPEC.md#stable-semantic-rules) Multi-Instance
accounts: an instance's completion submits exactly its output data item, which fills the instance's slot whatever
the completion order; the output collection, in item order, is written only when every slot is filled
(`PMI-FINISH-01`); a completion condition that holds before then closes the Activity, ending the remaining
instances, with no output collection (`PMI-EARLY-01`); an empty collection completes at once with an empty output
collection. An interrupting boundary leaves the occurrence with every instance in it and writes nothing
(`PMI-TIMER-01`).
-/

public section

namespace Kernel.Feature.MultiInstance

/-- `Hooks.multiInstanceMode`. -/
def modeName : MultiInstanceMode → String
  | .sequential => "sequential"
  | .parallel => "parallel"

/-- The instances to open now: every waiting one in parallel, else the first waiting one once none runs. -/
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

def output? : Iteration → Option Value
  | .completed output => some output
  | .waiting => none
  | .active _ => none

def runOf? (state : State) (scope : ScopeOccurrenceId) : Option MultiInstanceRun :=
  state.slots.multiInstances.runs.find? (·.scope == scope)

def setRun (state : State) (run : MultiInstanceRun) : State :=
  let runs := state.slots.multiInstances.runs
  let runs := if runs.any (·.scope == run.scope) then runs.map (fun other => if other.scope == run.scope then run else other)
    else runs ++ [run]
  { state with slots := { state.slots with multiInstances := { state.slots.multiInstances with runs } } }

/-- The next activation of the Multi-Instance Activity `element`, recorded. -/
def enter (state : State) (element : ElementId) : State × Nat :=
  let entered := state.slots.multiInstances.entered
  let count := ((entered.find? (·.1 == element)).map (·.2)).getD 0 + 1
  ({ state with slots := { state.slots with multiInstances := { state.slots.multiInstances with
      entered := (element, count) :: entered.filter (·.1 != element) } } }, count)

/-- Open the instances `opening` names. -/
def openInstances (ctx : Ctx) (payload : ActivityPayload) (loop : MultiInstance) (run : MultiInstanceRun)
    (state : State) : Outcome := do
  let some kind := ctx.bodyWait payload | .error (.unsupported "multi-instance-body")
  let (state, instances) := (opening loop.mode run.instances).foldl (fun (state, instances) index =>
    let (state, item) := state.openAttached kind run.element run.scope none
    (state, instances.set index (.active item))) (state, run.instances)
  .ok (setRun state { run with instances })

/-- Leave the Activity's occurrence, ending every instance left in it and its boundaries, write `outputs` outward
from the enclosing occurrence and take the Activity's outgoing flows there. -/
def leave (payload : ActivityPayload) (run : MultiInstanceRun) (outputs : List (String × Value)) (state : State) :
    State :=
  let parent := ((state.scopes.find? (·.id == run.scope)).bind (·.parent)).getD State.root
  let left := (state.leaveScope run.scope).disarm run.scope.value
  (outputs.foldl (·.writeOutward parent ·) left).emit payload.envelope.outgoing parent

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

def written (loop : MultiInstance) (collection : Value) (outputs : List Value) : List (String × Value) :=
  match loop.outputCollection with
  | some name => [(name, outputCollection collection outputs)]
  | none => []

/-- `Hooks.arriveMultiInstance`. An unavailable input collection holds the token, as an unavailable InputSet does
([BPMN 2.0.2 §10.4.2](../../docs/reference/bpmn-2.0.2/README.md)). -/
def arriveMultiInstance (ctx : Ctx) (header : Header) (payload : ActivityPayload) (loop : MultiInstance)
    (arrival : Arrival) (state : State) : Outcome := do
  let source ← match loop.count with
    | .collection items => .ok items
    | .cardinality _ => .error (.unsupported "multi-instance-cardinality")
  match ctx.evaluate (state.visible arrival.scope) source with
  | .needsHost => .error (.unsupported "host-evaluation")
  | .failure _ => .ok (state.hold { flow := arrival.flow, scope := arrival.scope })
  | .value collection =>
    let (state, activation) := enter state header.id
    let (state, issued) := state.issue
    let scope : ScopeOccurrenceId := ⟨issued⟩
    let run : MultiInstanceRun := { scope, element := header.id, activation, collection, instances := [] }
    match run.items with
    | none => .error (.semanticFailure "multi-instance-collection")
    | some [] => .ok ((written loop collection []).foldl (·.writeOutward arrival.scope ·) state
        |>.emit payload.envelope.outgoing arrival.scope)
    | some items =>
      let state := { state with
        scopes := state.scopes ++ [{ id := scope, element := some header.id, parent := some arrival.scope, activation }] }
      let state := if payload.envelope.boundaries.isEmpty then state
        else state.signal (.arm scope.value header.id arrival.scope)
      openInstances ctx payload loop { run with instances := items.map fun _ => .waiting } state

/-- The value an instance's completion submits for its output data item: exactly that one name, and a String when
the input collection is a String List, whose output collection holds Strings only. -/
def submitted (loop : MultiInstance) (run : MultiInstanceRun) (values : List (String × Value)) :
    Except Failure Value :=
  match loop.outputDataItem, values with
  | some name, [(submittedName, value)] =>
    if submittedName != name then .error (.rejected "undeclared-output")
    else
      match run.collection, value with
      | .stringList _, .string _ => .ok value
      | .stringList _, _ => .error (.rejected "instance-output-kind")
      | _, _ => .ok value
  | some _, [] => .error (.rejected "output-unavailable")
  | _, _ => .error (.rejected "undeclared-output")

/-- `Hooks.completeInstance`: fill the instance's slot, then finish, close early or continue. -/
def completeInstance (ctx : Ctx) (_ : Header) (payload : ActivityPayload) (loop : MultiInstance) (item : OpenItem)
    (values : List (String × Value)) (state : State) : Outcome := do
  let some run := runOf? state item.scope | .error (.semanticFailure "instance-without-multi-instance")
  let some index := run.instances.findIdx? fun
      | .active id => id == item.id
      | .waiting => false
      | .completed _ => false
    | .error (.semanticFailure "instance-without-slot")
  let output ← submitted loop run values
  let run := { run with instances := run.instances.set index (.completed output) }
  let state := setRun ((state.closeItem item.id).disarm item.id) run
  let outputs := run.instances.filterMap output?
  if outputs.length == run.instances.length then .ok (leave payload run (written loop run.collection outputs) state)
  else
    let stop ← match loop.completionCondition with
      | none => .ok false
      | some condition =>
        match ctx.evaluate (state.visible run.scope) condition with
        | .value (.bool holds) => .ok holds
        | .value _ => .error (.semanticFailure "completion-condition-not-boolean")
        | .needsHost => .error (.unsupported "host-evaluation")
        | .failure code => .error (.semanticFailure code)
    if stop then .ok (leave payload run [] state) else openInstances ctx payload loop run state

end Kernel.Feature.MultiInstance
