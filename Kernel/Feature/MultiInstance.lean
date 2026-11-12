module

public import Kernel.Hooks

/-! # Multi-Instance Activities

Owns matching on `MultiInstanceMode` and the Multi-Instance body. A token reaching an Activity with Multi-Instance
loop characteristics begins the body's occurrence, evaluates the input collection once and, for a nonempty collection,
enters the body's scope occurrence, which is the host its boundaries attach to. Each instance runs in a scope
occurrence of its own holding its input data item, as an occurrence of the Activity that `Kernel.Feature.Work` runs
like any other. A parallel Activity enters every instance at once and begins them in item order, under
`declarationDepthFirst` each once the one before has reached its next wait, join or end (CIB-OP-0016); a sequential
one begins the next after each completion ([BPMN 2.0.2 §13.3.7](../../docs/reference/bpmn-2.0.2/README.md)).

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
feeds, or the `inputDataItem`'s `name`, none when it has no name, else `camunda:elementVariable`, which admission
admits only without an `inputDataItem` (CIB-INT-0014, `BpmnParse.java:1863-1873`). -/
def itemName (ctx : Ctx) (loop : MultiInstance) : Option String :=
  match ctx.program.options.multiInstanceBinding with
  | .dataAssociations => loop.inputDataItem
  | .loopReferences => loop.inputDataItemName <|> loop.elementVariable

def runOf? (state : State) (body : Nat) : Option MultiInstanceRun :=
  state.slots.multiInstances.find? (·.occurrence == body)

def setRun (state : State) (run : MultiInstanceRun) : State :=
  let runs := state.slots.multiInstances
  let runs := if runs.any (·.occurrence == run.occurrence) then runs.map (fun other => if other.occurrence == run.occurrence then run else other)
    else runs ++ [run]
  { state with slots := { state.slots with multiInstances := runs } }

/-- CIB's counts on the body (CIB-INT-0018): the count, from entry in sequential mode (CIB-INT-0002); the active
instances, which CIB never lowers below 1 in sequential mode (`SequentialMultiInstanceActivityBehavior:38-45`,
`:47-61`); the completed ones (`ParallelMultiInstanceActivityBehavior:64-68`, `:84-87`). -/
def bodyCounts (loop : MultiInstance) (instances : List Iteration) : List (String × Nat) :=
  let total := instances.length
  let completed := (instances.filter slotFilled).length
  let active := if loop.mode == .sequential then 1 else total - completed
  (multiInstanceCounterNames.drop 1).zip [total, active, completed]

/-- An instance's zero-based `loopCounter` (`MultiInstanceActivityBehavior:76-78`). -/
def instanceCounts (index : Nat) : List (String × Nat) :=
  (multiInstanceCounterNames.take 1).map (·, index)

/-- `counts` as the execution locals CIB holds them in (`MultiInstanceActivityBehavior:196-198`) under
`MultiInstanceCounters.cibLocals`; the standards reading holds none, Table 10.30's counts being instance attributes no
expression names. -/
def counterLocals (ctx : Ctx) (counts : List (String × Nat)) : List (String × Value) :=
  match ctx.program.options.multiInstanceCounters with
  | .none => []
  | .cibLocals => counts.map fun (name, count) => (name, .int count)

/-- Whether `variables` hold exactly the counter locals of `counts`. -/
def holdsCounts (ctx : Ctx) (variables : List (String × Value)) (counts : List (String × Nat)) : Bool :=
  (counterLocals ctx counts).all fun (name, _) =>
    match variables.lookup name, counts.lookup name with
    | some (.int actual), some expected => actual == expected
    | _, _ => false

/-- Queue the begins of instances already entered, in item order. Under `declarationDepthFirst` a parallel body defers
them onto the closure's work stack, instance 0 on top: CIB creates every instance's execution, then starts them from the
last index down onto its LIFO operation queue, so each runs to its next wait, join or end before the next begins, and
all of them before the work queued beneath the body (CIB-OP-0016, `ParallelMultiInstanceActivityBehavior:50-61`).
Otherwise each begins as a `begin` signal, before any token moves: under `orderInvariant` the order among parallel
instances is no BPMN meaning (§13.3.7), and a sequential body's next instance begins from the completion of the one
before, where CIB's `createNextInstance` starts it (`SequentialMultiInstanceActivityBehavior:59`). -/
def queueInstances (ctx : Ctx) (mode : MultiInstanceMode) (requests : List BeginRequest) (state : State) : State :=
  let signalled := requests.foldl (fun state request => state.signal (.begin request)) state
  match ctx.program.options.branchSchedule with
  | .orderInvariant => signalled
  | .declarationDepthFirst => if mode == .parallel then state.deferBegins requests else signalled

/-- Begin the instances `opening` names, each in a scope occurrence holding its input data item and, under
`cibLocals`, its `loopCounter`. -/
def beginInstances (ctx : Ctx) (loop : MultiInstance) (items : List Value) (run : MultiInstanceRun) (state : State) :
    State :=
  let (state, instances, requests) := (opening loop.mode run.instances).foldl
    (fun (state, instances, requests) index =>
      let locals := counterLocals ctx (instanceCounts index) ++ match itemName ctx loop, items[index]? with
        | some name, some value => [(name, value)]
        | _, _ => []
      let (state, scope) := state.enterScope run.element run.scope locals none
      let request : BeginRequest := { element := run.element, scope, continuation := .multiInstance run.occurrence }
      (state, instances.set index (.active scope), requests ++ [request]))
    (state, run.instances, [])
  setRun (queueInstances ctx loop.mode requests state) { run with instances }

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
  match ctx.evaluate { state.evalContext ctx.program scope with domainChecked := false } expression with
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
    let some _ := occurrence.incoming | .error (.semanticFailure "multi-instance-without-flow")
    .ok (state.hold { occurrence := occurrence.id, scope := occurrence.scope })
  | some (collection, _, 0) =>
    .ok (state.signal (.complete occurrence.id .outgoing (written ctx loop collection []) .outward))
  | some (collection, items, count) =>
    let instances := List.replicate count Iteration.waiting
    let (state, scope) :=
      state.enterScope header.id occurrence.scope (counterLocals ctx (bodyCounts loop instances)) (some occurrence.id)
    let state := if envelope.boundaries.isEmpty then state
      else state.signal (.arm occurrence.id header.id occurrence.scope)
    let run : MultiInstanceRun := { scope, element := header.id, occurrence := occurrence.id, collection, instances }
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

/-- The names an instance's completion leaves as result locals: an effect's result values, unless the loop names an
output data item. A Call's writes are its output mappings, which CIB performs on the instance execution
(`CallableElementActivityBehavior.java:132-139`), not results: an item-named target writes the instance's item local,
which the completion condition reads and the instance's end discards, as CIB's next `performInstance` or the body's
end does (`SequentialMultiInstanceActivityBehavior.java:53`, `ParallelMultiInstanceActivityBehavior.java:96`). -/
def resultNames (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (writes : List (String × Value)) :
    List String :=
  let mapped := ((ctx.program.element? run.element).bind (·.activity?)).any fun (_, payload) => payload.work.call?.isSome
  if loop.outputDataItem.isNone && !mapped then writes.map (·.1) else []

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
  let context := state.evalContext ctx.program scope
  let counters := counterLocals ctx (instanceCounts index ++ bodyCounts loop run.instances)
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

/-- The collection a sequential loop reads again before each later instance, under `CollectionRead.sequentialReread`:
CIB re-reads it in `complete`, before `performInstance` binds the next item (`SequentialMultiInstanceActivityBehavior
.java:56-58`); a cardinality loop has none. -/
def rereadCollection (ctx : Ctx) (loop : MultiInstance) : Option Expression :=
  match ctx.program.options.multiInstanceCollection, loop.count with
  | .entrySnapshot, _ => none
  | .sequentialReread, .collection items => if loop.mode == .sequential then some (collectionOf ctx loop items) else none
  | .sequentialReread, .cardinality _ => none
  | .sequentialReread, .countAndCollection _ _ => none

/-- The items the instance at `next` takes its item from: the entry snapshot, or under a re-read the current collection,
while the entry total stays and `run.collection` keeps the entry value. CIB reads it in the body's execution, which
holds the item, `loopCounter` and the result locals of this and every earlier instance (`Sequential…:53`), so it is
read in the completing instance's scope occurrence before that is left, as the completion condition is. A value that is
no collection fails the operation (a `ClassCastException`, `MultiInstanceActivityBehavior.java:96-97`), as does one
shorter than `next + 1` (`getElementAtIndex`'s iterator, `:131-138`) and a failing JUEL read. -/
def nextItems (ctx : Ctx) (loop : MultiInstance) (run : MultiInstanceRun) (next : Nat) (scope : ScopeOccurrenceId)
    (results : List String) (state : State) : Except Failure (List Value) :=
  match rereadCollection ctx loop with
  | none => .ok (run.items.getD [])
  | some read =>
    -- Dynamic-only: which names an earlier instance's result left on CIB's body depends on the run's effect results.
    if run.results.any (!results.contains ·) then .error (.unsupported "multiInstance.sequentialResultLeftover")
    else
      -- Dynamic-only: a removed or null collection leaves CIB's previous item in place
      -- (`MultiInstanceActivityBehavior.java:85-88`), a value the kernel does not reproduce.
      let removed : Except Failure (List Value) := .error (.unsupported "multiInstance.collectionRemoved")
      match ctx.evaluate { state.evalContext ctx.program scope with domainChecked := false } read, read with
      | .unsupported code, _ => .error (.unsupported code)
      | .failure "unknown-variable", .variable _ => removed
      | .failure code, _ => .error (.rolledBack code)
      | .value .null, _ => removed
      | .value value, _ =>
        match collectionItems value with
        | none => .error (.rolledBack "multiInstance.notACollection")
        | some members =>
          if next < members.length then .ok members else .error (.rolledBack "multiInstance.collectionShortened")

/-- `Hooks.instanceCompleted`: fill the instance's slot, evaluate the completion condition in the instance's scope
occurrence, leave it, then finish, close early or continue, updating the body's counter locals first. -/
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
  let results := resultNames ctx loop run writes
  let shadows := results.any fun name => multiInstanceCounterNames.contains name || some name == itemName ctx loop
  let intact := holdsCounts ctx (state.ownVariables run.scope) (bodyCounts loop run.instances) &&
    holdsCounts ctx (state.ownVariables occurrence.scope) (instanceCounts index)
  -- Dynamic-only: an effect result's names, and a write that reached a counter local, are the run's data. CIB's next
  -- read of a counter is typed (`MultiInstanceActivityBehavior:200-204`); the kernel decides no other value there.
  if shadows || !intact then .error (.unsupported "multiInstance.resultShadowsInstance")
  let run := { run with instances := run.instances.set index (.completed output) }
  let exhausted := run.instances.all slotFilled
  let stop ← if exhausted && !evaluatesFinalCondition ctx loop then .ok false
    else stops ctx loop run index occurrence.scope results state
  let run := { run with results := if loop.mode == .sequential then (run.results ++ results).eraseDups else [] }
  let left := setRun (state.leaveScope occurrence.scope) run
  if stop || exhausted then .ok (finish ctx loop run left)
  else
    let items ← nextItems ctx loop run (index + 1) occurrence.scope results state
    let counted := left.signal (.write run.scope (counterLocals ctx (bodyCounts loop run.instances)) .own)
    .ok (beginInstances ctx loop items run counted)

end Kernel.Feature.MultiInstance
