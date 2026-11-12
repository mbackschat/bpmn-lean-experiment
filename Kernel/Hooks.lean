module

public import Kernel.State
public import Kernel.State.Removal

/-! # Kernel hooks

The one seam between the generic step and the features. `Kernel.Step` dispatches on element, event role, input and
signal and calls the field for that case; `Kernel.Registry` fills the fields from the features. A lifecycle field a
registry leaves at its default refuses with `unsupported`, so an unregistered mechanism never silently drops a token;
the notification fields default to no-ops. The order in which `Step` calls hooks is semantic and owned by `Step`
alone.

Features never call each other. A feature that needs another feature's mechanism enqueues a `Signal`; the comment on
each field names the feature that owns it.
-/

public section

namespace Kernel

/-- An in-kernel evaluation. A failure is an absent reference (`unknown-variable`), which `Mapping.dialect` reads, or a
JUEL evaluation error (`juel.*`), which rolls the command back (CIB-OP-0004); `unsupported` is a value or Java
surface the kernel does not represent, never a semantic outcome
([expression semantics](../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#failure-semantics)). -/
inductive Evaluation where
  | value (result : Value)
  | failure (code : String)
  | unsupported (code : String)
  deriving Repr

/-- Whether a scope occurrence is a Multi-Instance instance, a compensation handler's context or ordinary. Filled by
`Kernel.Step`, which matches `Continuation` and reads the two feature slots that say so. -/
inductive ScopeRole where
  | ordinary
  | multiInstanceInstance
  | compensationHandler
  deriving DecidableEq, Repr

/-- The channel a Message trigger waits on: its Message's and Operation's identifiers, never its name (PC-MESSAGE-01). -/
def MessageTrigger.channel (trigger : MessageTrigger) : MessageChannel :=
  { messageId := trigger.messageRef, interfaceRef := trigger.interfaceRef, operationRef := trigger.operationRef }

def DeliveryTrigger.channel? : DeliveryTrigger → Option MessageChannel
  | .message channel => some channel
  | .signal _ _ => none

/-- The members of an input collection in order, `none` for a value that is not a collection; a String List's
members are Strings. -/
def collectionItems : Value → Option (List Value)
  | .stringList items => some (items.map .string)
  | .list items => some items
  | .null => none
  | .bool _ => none
  | .int _ => none
  | .decimal _ _ => none
  | .string _ => none
  | .map _ => none

def MultiInstanceRun.items (run : MultiInstanceRun) : Option (List Value) := collectionItems run.collection

/-! ## The portable value domain

[DATA-SEMANTICS-SPEC "Values"](../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md#values). `Step` checks every input's
values against it and features measure submissions by it; they share it here because they never import each other. -/

/-- Bytes `JSON.stringify` emits for `text` as a JSON string, quotes included: a quote, a backslash and the five
named controls take two bytes, every other control six (`\u00XX`). Every escaped byte is ASCII, so the census runs
over the UTF-8 bytes. -/
def stringBytes (text : String) : Nat :=
  text.toUTF8.foldl (fun total byte =>
    total + match byte.toNat with
      | 0x08 | 0x09 | 0x0a | 0x0c | 0x0d | 0x22 | 0x5c => 2
      | code => if code < 0x20 then 6 else 1) 2

/-- Bytes of a JSON array whose members take `sizes`, brackets and separators included. -/
def arrayBytes (sizes : List Nat) : Nat :=
  2 + sizes.foldl (· + ·) 0 + (sizes.length - 1)

mutual
/-- The canonical JSON bytes of a portable value: no whitespace, `kind` before `value` (or `coefficient` and
`scale`), Map entries `name` before `value`; the field order changes no count. A String List is outside the portable
value arms and has no measure. -/
def valueBytes : Value → Option Nat
  | .null => some "{\"kind\":\"null\"}".utf8ByteSize
  | .bool value => some ("{\"kind\":\"boolean\",\"value\":}".utf8ByteSize + (toString value).utf8ByteSize)
  | .int value => some ("{\"kind\":\"integer\",\"value\":}".utf8ByteSize + (toString value).utf8ByteSize)
  | .decimal coefficient scale =>
    some ("{\"kind\":\"decimal\",\"coefficient\":,\"scale\":}".utf8ByteSize + stringBytes (toString coefficient) +
      (toString scale).utf8ByteSize)
  | .string value => some ("{\"kind\":\"string\",\"value\":}".utf8ByteSize + stringBytes value)
  | .stringList _ => none
  | .list items => do some ("{\"kind\":\"list\",\"value\":}".utf8ByteSize + arrayBytes (← itemsBytes items))
  | .map entries => do some ("{\"kind\":\"map\",\"value\":}".utf8ByteSize + arrayBytes (← entriesBytes entries))

def itemsBytes : List Value → Option (List Nat)
  | [] => some []
  | item :: items => do some ((← valueBytes item) :: (← itemsBytes items))

/-- Each entry as `{"name":…,"value":…}`. -/
def entriesBytes : List (String × Value) → Option (List Nat)
  | [] => some []
  | (name, value) :: entries => do
    some (("{\"name\":,\"value\":}".utf8ByteSize + stringBytes name + (← valueBytes value)) :: (← entriesBytes entries))
end

/-- A Decimal in canonical form: zero at scale 0; else scale `0..6`, a signed 64-bit coefficient, no trailing zero at
a positive scale. -/
def canonicalDecimal (coefficient scale : Int) : Bool :=
  if coefficient == 0 then scale == 0
  else 0 ≤ scale && scale ≤ 6 && -9223372036854775808 ≤ coefficient && coefficient ≤ 9223372036854775807 &&
    (scale == 0 || coefficient % 10 != 0)

/-- The UTF-8 bytes of a portable String or Map key, the one owner of that bound. -/
def textBytes : Nat := 1024

/-- The largest portable Integer, 2^53 − 1, the one owner of that bound. -/
def integerBound : Int := 9007199254740991

/-- Map keys of at most `textBytes` UTF-8 bytes, in strictly increasing Unicode-scalar order. -/
def keysInDomain (entries : List (String × Value)) : Bool :=
  entries.all (·.1.utf8ByteSize ≤ textBytes) && (entries.zip entries.tail).all fun (left, right) => decide (left.1 < right.1)

/- The bounds below are project policy, not CIB limits (the portable-values contract's "Finite limits"): four
container levels, 32 members per container, 256 value nodes, 16,384 canonical bytes, 1,024-byte Strings and keys,
Integers up to 2^53 − 1. -/
mutual
/-- The value nodes of `value`, the root included, when every node lies in the portable domain and no container is
nested deeper than four levels counting from `depth` containers above it; `none` otherwise. A String List is
outside the portable arms at every depth. -/
def domainNodes (depth : Nat) : Value → Option Nat
  | .null => some 1
  | .bool _ => some 1
  | .int value => if 0 ≤ value && value ≤ integerBound then some 1 else none
  | .decimal coefficient scale => if canonicalDecimal coefficient scale then some 1 else none
  | .string value => if value.utf8ByteSize ≤ textBytes then some 1 else none
  | .stringList _ => none
  | .list items => if depth < 4 && items.length ≤ 32 then (memberNodes (depth + 1) items).map (· + 1) else none
  | .map entries =>
    if depth < 4 && entries.length ≤ 32 && keysInDomain entries then (entryNodes (depth + 1) entries).map (· + 1)
    else none

def memberNodes (depth : Nat) : List Value → Option Nat
  | [] => some 0
  | item :: items => do some ((← domainNodes depth item) + (← memberNodes depth items))

def entryNodes (depth : Nat) : List (String × Value) → Option Nat
  | [] => some 0
  | (_, value) :: entries => do some ((← domainNodes depth value) + (← entryNodes depth entries))
end

/-- Whether `value` may be a variable's value: a portable value within every bound, or a `stringList` as a whole
variable value with at most 32 Strings of at most 1,024 bytes, the bounds its wire form has (DATA-SEMANTICS-SPEC
"Values"). -/
def inValueDomain : Value → Bool
  | .stringList items => items.length ≤ 32 && items.all (·.utf8ByteSize ≤ textBytes)
  | value =>
    match domainNodes 0 value, valueBytes value with
    | some nodes, some bytes => nodes ≤ 256 && bytes ≤ 16384
    | _, _ => false

/-- Refuse an input whose values leave the domain, before its transition: rejected whole, never truncated. -/
def admitValues (values : List Value) : Except Failure Unit :=
  if values.all inValueDomain then .ok () else .error (.rejected "value-outside-domain")

/-- The start Event a start input starts among the starts its trigger fired (`Hooks.startsFired`): the one it names,
else the only one; several unnamed are `start-ambiguous`, since one input starts one instance at one start. -/
def chooseStart (named : Option ElementId) (fired : List ElementId) : Except Failure ElementId :=
  match named, fired with
  | some id, _ => if fired.contains id then .ok id else .error (.rejected "no-start-event")
  | none, [only] => .ok only
  | none, [] => .error (.rejected "no-start-event")
  | none, _ :: _ :: _ => .error (.rejected "start-ambiguous")

/-- Hold an occurrence whose InputSet is unavailable (`FeatureSlots.held`). -/
def State.hold (state : State) (held : Held) : State :=
  { state with slots := { state.slots with held := state.slots.held ++ [held] } }

/-- What an expression evaluated from `scope` reads. -/
def State.evalContext (state : State) (scope : ScopeOccurrenceId) : EvalContext :=
  { variables := state.visible scope, nowMs := state.logicalTimeMs }

/-- The variables `scope` itself holds, without the chain behind it. -/
def State.ownVariables (state : State) (scope : ScopeOccurrenceId) : List (String × Value) :=
  ((state.variables.find? (·.scope == scope)).map (·.entries)).getD []

/-- How a catch trigger catches a raised event: its precedence, lower first, and the variables it writes. -/
structure Catch where
  rank : Nat
  writes : List (String × Value) := []
  deriving Repr

/-- What every hook may read: the program, the evaluator the profile selects, and the cross-owner queries. A
feature that needs to inspect a guarded type it does not own asks that type's owner through one of these queries,
which `Step` fills from the `Hooks` field of the same name. -/
structure Ctx where
  program : Program
  evaluate : EvalContext → Expression → Evaluation
  /-- Subscriptions: how a catch trigger catches a raised event (an exact Error or Escalation code before a catch-all),
  or `none` when it does not catch it. -/
  catches : Raised → Trigger → Option Catch
  /-- Scopes: the start subscription and interrupting flag of an Event Sub-Process, `none` for another scope. -/
  eventStart : ScopePayload → Option (Subscription × Bool)
  /-- `Step`: what a scope occurrence is, for a search that must not treat it as ordinary. -/
  scopeRole : State → ScopeOccurrenceId → ScopeRole := fun _ _ => .ordinary

/-- `bindings` with only the last binding of each target, by target name: a target bound twice keeps the value written
last, as CIB's sequential writes do, and the bindings, one per target, then commute, so they are kept in the name order
a publication shows them in. -/
def lastWrites (bindings : List (String × Value)) : List (String × Value) :=
  (bindings.foldr (fun binding kept => if kept.any (·.1 == binding.1) then kept else binding :: kept) []).mergeSort
    fun left right => decide (left.1 ≤ right.1)

/-- Evaluate each mapping's source in document order, as CIB runs a parameter list one at a time
(`IoMapping.java:38-48`), against `reads earlier`, the context given the bindings `earlier` the mappings before it
made. A failed source is read by the mapping's dialect: a Data Association's source is unavailable (`none`,
BPMN 2.0.2 §10.4.2, which the caller decides on) and the later sources are still evaluated, an `ioParameter`
expression rolls the command back with the evaluation's own code (CIB-EXT-0024), and a `callVariable` copy reads null
(CIB-EXT-0021). The first rollback or `unsupported` ends the evaluation, so a later mapping is never reached, as in
CIB, where the first throwing parameter ends the command. A target bound twice keeps its last value (`lastWrites`).
Features share it here because they never import each other. -/
def Ctx.evaluateMappingsWith (ctx : Ctx) (reads : List (String × Value) → EvalContext) (mappings : List Mapping) :
    Except Failure (Option (List (String × Value))) := do
  let (made, available) ← mappings.foldlM (init := ([], true)) fun (made, available) mapping =>
    match ctx.evaluate (reads made) mapping.source with
    | .value value => .ok (made ++ [(mapping.target, value)], available)
    | .unsupported code => .error (.unsupported code)
    | .failure code =>
      match mapping.dialect with
      | .dataAssociation => .ok (made, false)
      | .ioParameter => .error (.rolledBack code)
      | .callVariable => .ok (made ++ [(mapping.target, Value.null)], available)
  return if available then some (lastWrites made) else none

/-- `evaluateMappingsWith` where every mapping reads `context`, which no earlier mapping changes. -/
def Ctx.evaluateMappings (ctx : Ctx) (context : EvalContext) (mappings : List Mapping) :
    Except Failure (Option (List (String × Value))) :=
  ctx.evaluateMappingsWith (fun _ => context) mappings

/-- What an Activity's or a Scope's next output mapping reads, given the outputs `written` before it: `own`, the frame's
submitted values and own locals, `installed`, the values the frame set before its outputs run, then `outer`, the chain
the outputs are written into. Under `OutputContext.activityScope` the outputs read every name where CIB holds it when
the next parameter resolves in the frame. CIB writes each output parameter into the outer scope before it evaluates the
next one (`IoMapping.java:44-48`, `OutputParameter.java:44-52`), so the outputs already written stand behind `own`, the
latest first. An installed value went through `setVariable` on the frame's execution (`AbstractVariableScope.java:331-345`):
one of a name the frame holds is that local and shadows, any other reached its nearest owner or the root, where a
later write of the same name replaces it, so it stands behind the written outputs and ahead of the outer chain
(CIB-EXT-0031). -/
def Ctx.outputReads (ctx : Ctx) (nowMs : Nat) (own installed outer : List (String × Value))
    (written : List (String × Value)) : EvalContext :=
  match ctx.program.options.outputContext with
  | .submission => { variables := installed ++ own ++ outer, nowMs }
  | .activityScope =>
    let (held, outward) := installed.partition fun (name, _) => own.any (·.1 == name)
    { variables := held ++ own ++ written.reverse ++ outward ++ outer, nowMs }

/-- The bindings of `mappings` where an unavailable source has no state to wait in, a semantic failure. -/
def Ctx.requireMappingsWith (ctx : Ctx) (reads : List (String × Value) → EvalContext) (mappings : List Mapping) :
    Except Failure (List (String × Value)) := do
  match ← ctx.evaluateMappingsWith reads mappings with
  | some bindings => .ok bindings
  | none => .error (.semanticFailure "mapping-source-unavailable")

/-- `requireMappingsWith` where every mapping reads `context`. -/
def Ctx.requireMappings (ctx : Ctx) (context : EvalContext) (mappings : List Mapping) :
    Except Failure (List (String × Value)) :=
  ctx.requireMappingsWith (fun _ => context) mappings

/-- The open item with the public identity `occurrence` whose view has the detail `detail` reads, with that detail. -/
def itemDetail? {α : Type} (ctx : Ctx) (state : State) (occurrence : OccurrenceRef) (detail : WaitView → Option α) :
    Option (OpenItem × α) :=
  state.openItems.findSome? fun item =>
    if ctx.program.publicId item.element == occurrence.element &&
        ((state.occurrence? item.occurrence).map (·.activation)) == some occurrence.activation &&
        state.instanceOf item.scope == occurrence.processInstanceId
    then (detail item.kind.view).map (item, ·) else none

/-- The open item with the public identity `occurrence` whose view has the detail `detail` reads. -/
def item? {α : Type} (ctx : Ctx) (state : State) (occurrence : OccurrenceRef) (detail : WaitView → Option α) :
    Option OpenItem :=
  (itemDetail? ctx state occurrence detail).map (·.1)

/-- The subscription an open item belongs to: a boundary's, a catch Event's or an Event Sub-Process start's; an
Activity's own subscription (a Receive Task) is the work feature's. Subscriptions and Correlation
share it here because features never import each other. -/
def subscription? (ctx : Ctx) (item : OpenItem) : Option Subscription :=
  match ctx.program.boundary? item.element with
  | some (_, boundary) => some boundary.subscription
  | none =>
    let element := ctx.program.element? item.element
    let catchEvent := element.bind (·.event?) |>.bind fun (_, event) => event.catch?
    let eventStart := element.bind (·.start?) |>.bind (·.1.parent) |>.bind ctx.program.element?
      |>.bind (·.scope?) |>.bind fun (_, payload) => (ctx.eventStart payload).map (·.1)
    catchEvent <|> eventStart

/-- The one way a boundary fires: an interrupting boundary first cancels the occurrence `host` it hangs on, if any; then
the boundary's occurrence, the reservation `reserved` or a fresh one, begins and leaves on its flows in `scope`
(BPMN 2.0.2 §13.5.3, §10.5.6). -/
def Boundary.fire (boundary : Boundary) (host reserved : Option Nat) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (state : State) : State :=
  let interrupted := match boundary.interrupting, host with
    | true, some owner => state.signal (.cancel owner)
    | true, none => state
    | false, _ => state
  let leave : Leave := .flows boundary.outgoing
  interrupted.signal <| match reserved with
    | some id => .complete id leave writes .outward
    | none => .occur boundary.id scope leave writes .outward

/-- What a Scope begins with besides its evaluated inputs. `inner` is the reservation of an Event Sub-Process's start
Event, when a subscription triggered it. -/
structure ScopeEntry where
  locals : List (String × Value) := []
  inner : Option Nat := none
  deriving Repr

/-- The default of every lifecycle hook: the mechanism is not registered. -/
def refuse {α : Type} (code : String) : α → Outcome := fun _ => .error (.unsupported code)

structure Hooks where
  /-- Starts: a start Event's occurrence began, fired by the trigger. -/
  arriveStart : Ctx → Header → StartPayload → StartTrigger → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "start"
  /-- Work: an Activity's occurrence began. -/
  arriveActivity : Ctx → Header → ActivityPayload → Occurrence → State → Outcome :=
    fun _ _ _ _ => refuse "activity"
  /-- MultiInstance: the body occurrence of an element with Multi-Instance loop characteristics began. -/
  arriveMultiInstance : Ctx → Header → Envelope → MultiInstance → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "multiInstance"
  /-- Scopes. -/
  arriveScope : Ctx → Header → ScopePayload → Occurrence → ScopeEntry → State → Outcome :=
    fun _ _ _ _ _ => refuse "scope"
  /-- Flow. -/
  arriveGateway : Ctx → Header → GatewayPayload → Occurrence → State → Outcome := fun _ _ _ _ => refuse "gateway"
  /-- Subscriptions. -/
  arriveCatch : Ctx → Header → EventPayload → Subscription → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "catchEvent"
  /-- Propagation. -/
  arriveThrow : Ctx → Header → EventPayload → Throw → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "throwEvent"
  /-- Flow. -/
  arriveLink : Ctx → Header → EventPayload → Occurrence → State → Outcome := fun _ _ _ _ => refuse "linkEvent"
  /-- Scopes: the scope occurrence of a Scope element is idle. The last argument is its owning occurrence. -/
  completeScope : Ctx → Header → ScopePayload → ScopeOccurrence → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeScope"
  /-- Work: the root of a called process instance is idle; the header and payload are its Call Activity's. -/
  completeCall : Ctx → Header → ActivityPayload → ScopeOccurrence → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeCall"
  /-- MultiInstance: the scope occurrence of a Multi-Instance body is idle. -/
  completeBody : Ctx → Header → Envelope → MultiInstance → Occurrence → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeBody"
  /-- Work: complete an open User Task with the submitted values. -/
  completeUserTask : Ctx → Header → ActivityPayload → OpenItem → List (String × Value) → State → Outcome :=
    fun _ _ _ _ _ => refuse "completeUserTask"
  /-- Work: the outcome of an open effect. -/
  effectResult : Ctx → OpenItem → EffectOutcome → State → Outcome := fun _ _ _ => refuse "effectResult"
  /-- Work: retry the open incident `OpenItem`, whose detail is given, for the generation the command names. -/
  retryIncident : Ctx → OpenItem → IncidentDetail → Nat → State → Outcome := fun _ _ _ _ => refuse "retryIncident"
  /-- Work: cancel the process of the open incident whose detail is given, for the generation the command names. -/
  cancelIncidentProcess : Ctx → IncidentDetail → Nat → State → Outcome := fun _ _ _ => refuse "cancelIncidentProcess"
  /-- Work: a message or timer subscription an Activity opened itself (a Receive Task) fired. -/
  triggerActivity : Ctx → Header → ActivityPayload → OpenItem → Fired → State → Outcome :=
    fun _ _ _ _ _ => refuse "triggerActivity"
  /-- Subscriptions: any other message or timer subscription fired (catch Events, boundaries, Event Sub-Process
  starts, Event-Based Gateway arms). -/
  trigger : Ctx → OpenItem → Fired → State → Outcome := fun _ _ _ => refuse "trigger"
  /-- Subscriptions: `Signal.arm`. -/
  arm : Ctx → Nat → ElementId → ScopeOccurrenceId → State → Outcome := fun _ _ _ _ => refuse "arm"
  /-- Subscriptions: `Signal.armScope`. -/
  armScope : Ctx → ScopeOccurrenceId → State → Outcome := fun _ _ => refuse "armScope"
  /-- Subscriptions: `Signal.armGateway`. -/
  armGateway : Ctx → Nat → ElementId → ScopeOccurrenceId → State → Outcome := fun _ _ _ _ => refuse "armGateway"
  /-- Propagation: `Signal.raise`. -/
  raise : Ctx → Raised → Origin → State → Outcome := fun _ _ _ => refuse "raise"
  /-- Compensation: `Signal.compensate`. -/
  compensate : Ctx → ScopeOccurrenceId → Option ElementId → OccurrenceRef → Option Nat → Option Resume → State → Outcome :=
    fun _ _ _ _ _ _ => refuse "compensate"
  /-- Compensation: `Signal.compensationFailed`. -/
  failCompensation : Ctx → ScopeOccurrenceId → String → Option String → Origin → State → Outcome :=
    fun _ _ _ _ _ => refuse "failCompensation"
  -- The completion pipeline, in the order `Step` runs it
  /-- Subscriptions: disarm the items attached to the completing occurrence. -/
  leave : Ctx → Occurrence → State → Outcome := fun _ _ => refuse "leave"
  /-- Flow: resolve a completion's outgoing flows when the profile evaluates its conditions before its output writes
  (`ConditionOrder.beforeOutputs`); otherwise the leave is unchanged and `outflow` resolves it. -/
  select : Ctx → Occurrence → Leave → State → Except Failure Leave :=
    fun _ _ _ _ => .error (.unsupported "select") -- dynamic-only: a registry without the hook
  /-- Data: apply writes from a scope occurrence: a completion's, and `Signal.write`. -/
  writeOutputs : Ctx → ScopeOccurrenceId → List (String × Value) → WriteRule → State → Outcome :=
    fun _ _ _ _ => refuse "writeOutputs"
  /-- Data: `Signal.remove`. -/
  removeVariables : Ctx → ScopeOccurrenceId → List String → State → Outcome := fun _ _ _ => refuse "removeVariables"
  /-- Compensation: retain the completed occurrence when its element has a handler. -/
  completed : Ctx → Occurrence → State → Outcome := fun _ _ => refuse "completed"
  /-- Flow: leave through flows. -/
  outflow : Ctx → Occurrence → Leave → State → Outcome := fun _ _ _ => refuse "outflow"
  /-- MultiInstance: one instance of the body occurrence completed. -/
  instanceCompleted : Ctx → Nat → Occurrence → List (String × Value) → State → Outcome :=
    fun _ _ _ _ => refuse "instanceCompleted"
  /-- Compensation: a handler of the run in that scope occurrence completed. -/
  handlerCompleted : Ctx → ScopeOccurrenceId → Occurrence → State → Outcome :=
    fun _ _ _ => refuse "handlerCompleted"
  /-- Compensation: a handler of the run in that scope occurrence left without completing, raised by an event. -/
  handlerEnded : Ctx → ScopeOccurrenceId → Occurrence → State → Outcome :=
    fun _ _ _ => refuse "handlerEnded"
  -- Notifications
  /-- A generic cancellation removed the occurrence; a feature that must react has this one place. -/
  cancelled : Ctx → Occurrence → State → Outcome := fun _ _ state => .ok state
  /-- Subscriptions: variables were written (PC-CONDITION-01). -/
  written : Ctx → List WriteEvent → State → Outcome := fun _ _ state => .ok state
  -- Queries and the evaluator
  evaluate : EvalContext → Expression → Evaluation := fun _ _ => .failure "no-evaluator"
  /-- Subscriptions: `Ctx.catches`. -/
  catches : Raised → Trigger → Option Catch := fun _ _ => none
  /-- Scopes: `Ctx.eventStart`. -/
  eventStart : ScopePayload → Option (Subscription × Bool) := fun _ => none
  /-- Starts: the root start Events a start input's trigger fires, in document order; `chooseStart` picks the one
  the input starts. `Kernel.Population` asks it too, to start every fired start. -/
  startsFired : Ctx → StartInput → Except Failure (List ElementId) := fun _ _ => .ok []
  /-- Correlation: whether the open item is a correlated Message subscription on the channel whose criteria, evaluated
  in the current state, equal the delivered correlation; `false` for any other item. `Kernel.Population` asks it to
  find the candidates of a correlated publication. -/
  correlates : Ctx → OpenItem → MessageChannel → List CorrelationMatch → State → Except Failure Bool :=
    fun _ _ _ _ _ => .error (.unsupported "correlates") -- dynamic-only: a registry without the hook
  /-- Subscriptions: the open item a `deliver` input fires, with its firing, or the delivery's refusal; `Kernel.Step`
  fires it. -/
  delivered : Ctx → DeliveryInput → State → Except Failure (OpenItem × Fired) :=
    fun _ _ _ => .error (.unsupported "delivered") -- dynamic-only: a registry without the hook

end Kernel
