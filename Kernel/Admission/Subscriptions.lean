module

public import Kernel.IL.Types
public import Kernel.IL.Timer

/-! # Admission of catch Events, boundaries and triggered starts. A refusal carries a stable code.

Admitted: Timers with a literal `Kernel.Timer.classify` admits, Messages with a literal name and no
correlation, a correlated Message only on a catch Event, and, on boundaries, the triggers that
`Kernel.Feature.Propagation` delivers (an interrupting Error, Escalation, Compensation, and Cancel on a Transaction).
-/

public section

namespace Kernel.Admission.Subscriptions

/-- How a subscription's site reads an expression, given by the registry from `Kernel.Admission.Data` at that site: the
Core JUEL table, which the Events level reuses for Timer values, Message names and Conditional predicates
(ARCHITECTURE-SPEC JUEL levels), and a plain variable read. -/
structure Reading where
  juel : List JuelNode → Option String := fun _ => none
  name : String → Option String := fun _ => none

/-- An Events-level expression under `Evaluator.juel`: a JUEL table or a plain variable read; any other form, and
every expression under Simple Boolean, is refused as `refusal`. -/
def eventsExpression (options : ProfileOptions) (reading : Reading) (refusal : String) : Expression → Option String
  | .juel nodes => if options.evaluator == .juel then reading.juel nodes else some refusal
  | .variable name => if options.evaluator == .juel then reading.name name else some refusal
  | .simpleBoolean _ => some refusal
  | .literal _ => some refusal
  | .foreign _ _ => some refusal

/-- A Conditional catch, boundary or Event Sub-Process start. Its predicate is read by the profile's evaluator: Simple
Boolean, or JUEL at the Events level (CIB-EXT-0030 for a condition without a language). CIB's filters
`camunda:variableName` and `camunda:variableEvents` belong to its each-write model (CIB-EXT-0035), so they are refused
under `edge`, and an event name CIB does not dispatch is refused under `eachWrite`. -/
def conditionRefusal (options : ProfileOptions) (reading : Reading) (trigger : ConditionTrigger) : Option String :=
  let filters := match options.conditionalRetrigger with
    | .edge => if trigger.variableName.isSome || !trigger.variableEvents.isEmpty then some "event.condition.filter" else none
    | .eachWrite =>
      if trigger.variableEvents.all VariableEvent.named then none
      else some "event.condition.variableEvents"
  let predicate := match trigger.condition with
    | .simpleBoolean _ => if options.evaluator == .juel then some "expression.outsideJuel" else none
    | other => eventsExpression options reading "event.condition.foreign" other
  filters <|> predicate

/-- The static refusal of a Timer lexeme family; `Kernel.Timer.Code.dynamic` is its run-time twin. -/
def timerRefusal : Timer.Code → String
  | .duration => "timer.duration"
  | .date => "timer.date"
  | .cycle => "timer.cycle"
  | .cron => "timer.cron"

/-- A Timer literal as `Kernel.Timer.classify` reads it: outside the subset is refused everywhere, malformed unless
`admitMalformed` (`ProfileOptions.malformedTimer = rollsBackArming`), where arming it rolls back. A cycle is admitted at
every subscription site, one that fires once taking only its first occurrence (I1). A root start (`rootStart`) is armed
by its host from `Timer.resolve`, so it takes only what that offers, and a cycle there is PC-TIMER-04's. -/
def timer (admitMalformed rootStart : Bool) (trigger : TimerTrigger) : Option String :=
  let lexeme (kind : Timer.Kind) (code : Timer.Code) (value : ValueSource) : Option String :=
    match value with
    | .expression _ => some (timerRefusal code)
    | .literal text =>
      match Timer.classify kind text with
      | .admitted _ => none
      | .outside code => some (timerRefusal code)
      | .malformed code => if admitMalformed then none else some (timerRefusal code)
  match trigger.schedule, rootStart with
  | .cycle _ _, true => some "timer.cycleNotAttached"
  | .date _, true => some "timer.date"
  | .duration _, true =>
    match Timer.resolve trigger.schedule with
    | .ok _ => none
    | .error _ => some "timer.duration"
  | .duration value, false => lexeme .duration .duration value
  | .date value, false => lexeme .date .date value
  | .cycle value .iso8601, false => lexeme .cycle .cycle value
  | .cycle value .cron, false => lexeme .cycle .cron value

/-- A Timer at a subscription site: a value given by an expression is read at the Events level and classified when it
is armed (PC-TIMER-03); a literal is classified now (`timer`). A root start's expression is PC-TIMER-04's. -/
def timerAt (options : ProfileOptions) (reading : Reading) (rootStart : Bool) (trigger : TimerTrigger) : Option String :=
  let (value, code) : ValueSource × String := match trigger.schedule with
    | .duration value => (value, "timer.duration")
    | .date value => (value, "timer.date")
    | .cycle value _ => (value, "timer.cycle")
  match value, rootStart with
  | .expression body, false => eventsExpression options reading code body
  | .expression _, true => timer (options.malformedTimer == .rollsBackArming) rootStart trigger
  | .literal _, _ => timer (options.malformedTimer == .rollsBackArming) rootStart trigger

/-- A Message's name (PC-MESSAGE-01). Under `MessageNames.description` it is a description: absent or blank is admitted
and an expression, which BPMN 2.0.2 does not have, is refused. Under `addresses` CIB subscribes by it: a missing or
blank one (Java's `trim`, `EventSubscriptionDeclaration.java:85-87`) is refused (`BpmnParse.java:1271-1274`), and an
expression is read at the Events level, except at a root start (`BpmnParse.java:4888-4899`). -/
def messageName (options : ProfileOptions) (reading : Reading) (rootStart : Bool) : Option ValueSource → Option String
  | none => if options.messageNames == .addresses then some "message.unnamed" else none
  | some (.literal text) =>
    if options.messageNames == .addresses && text.toList.all (· ≤ ' ') then some "message.unnamed" else none
  | some (.expression body) =>
    match options.messageNames, rootStart with
    | .description, _ => some "message.nameExpression"
    | .addresses, true => some "start.messageNameExpression"
    | .addresses, false => eventsExpression options reading "message.nameExpression" body

/-- A Message subscription is addressed by its Message (`messageRef`, BPMN 2.0.2 §10.5.5); without one only an
occurrence-addressed command could reach it, which CIB-INT-0004 selects for a Receive Task alone (PC-MESSAGE-01). -/
def message (options : ProfileOptions) (reading : Reading) (rootStart : Bool) (trigger : MessageTrigger) :
    Option String :=
  if !trigger.correlation.isEmpty then some "message.correlation"
  else if trigger.messageRef.isNone then some "message.unspecified"
  else messageName options reading rootStart trigger.name

/-- A correlated catch, as the [specification](../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md)
bounds it: one key bound to a variable, an Operation channel, and no output, since its payload is never written. -/
def correlatedCatch (options : ProfileOptions) (reading : Reading) (subscription : Subscription)
    (trigger : MessageTrigger) : Option String :=
  match trigger.correlation with
  | [] => message options reading false trigger
  | [criterion] =>
    if !subscription.outputs.isEmpty then some "message.correlation.output"
    else if trigger.messageRef.isNone || trigger.interfaceRef.isNone || trigger.operationRef.isNone then
      some "message.correlation.channel"
    else
      match criterion.value with
      | .variable _ => message options reading false { trigger with correlation := [] }
      | .literal _ => some "message.correlation.value"
      | .simpleBoolean _ => some "message.correlation.value"
      | .juel _ => some "expression.juel.site"
      | .foreign _ _ => some "expression.outsideSimpleBoolean"
  | _ :: _ :: _ => some "message.correlation.keys"

/-- A Multiple or Parallel Multiple Event (BPMN 2.0.2 §10.5.1): pinned CIB keeps one of several definitions by a
precedence that depends on the position and never reads `parallelMultiple` (CIB-LIM-0008) (PC-BASIC-04). -/
def definitions (subscription : Subscription) : Option String :=
  if subscription.parallelMultiple then some "event.parallelMultiple"
  else if !subscription.alternatives.isEmpty then some "event.multipleDefinitions"
  else none

/-- Only a Message subscription writes what its delivery carries; any other trigger's outputs would be dropped. -/
def subscriptionOutputs (subscription : Subscription) : Option String :=
  if subscription.trigger.message?.isSome || subscription.outputs.isEmpty then none else some "event.outputs"

/-- Catch variables are a CIB extension (CIB-EXT-0028) the profile selects; BPMN 2.0.2 defines none. -/
def errorTrigger (variables : ErrorCatchVariables) (trigger : ErrorTrigger) : Option String :=
  match variables with
  | .eventScope => none
  | .refused =>
    if trigger.codeVariable.isSome then some "event.error.codeVariable"
    else if trigger.messageVariable.isSome then some "event.error.messageVariable"
    else none

/-- The code variable is CIB's extension (`camunda:escalationCodeVariable`), admitted with the Error catch variables
(CIB-EXT-0028). -/
def escalationTrigger (variables : ErrorCatchVariables) (trigger : EscalationTrigger) : Option String :=
  match variables with
  | .eventScope => none
  | .refused => if trigger.codeVariable.isSome then some "event.escalation.codeVariable" else none

/-- The codes of the raised-event boundaries and the literal Message names a host declared before the one being
admitted; `none` is an Escalation catch-all. -/
structure Declared where
  errorCodes : List String := []
  escalations : List (Option String) := []
  messageNames : List String := []

/-- At most one Escalation handler of one kind in one place may match any code: among the boundaries of a host, or among
the Event Sub-Processes of a scope, a second one of the same code, a catch-all beside any other, or two catch-alls are
refused as `refusal`, and an admitted one joins `earlier`. CIB 2.2.0 refuses each at deployment whatever the
interruption modes (`BpmnParse.java:3702-3735`). BPMN 2.0.2 §10.5.6 allows several non-interrupting handlers of one
declaration, which would all run; the kernel's search takes one catcher per level, so it refuses them under every
profile (PC-ESCALATION-02). -/
def escalationDeclared (refusal : String) (earlier : List (Option String)) (code : Option String) :
    Except String (List (Option String)) :=
  let conflicts := match code with
    | some name => earlier.contains none || earlier.contains (some name)
    | none => !earlier.isEmpty
  if conflicts then .error refusal else .ok (earlier ++ [code])

/-- An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02).
`earlier` holds the Escalation codes of the Event Sub-Processes the same scope declared before this one
(`escalationDeclared`). -/
def eventSubProcessAfter (earlier : List (Option String)) (start : Subscription) (interrupting : Bool) :
    Except String (List (Option String)) :=
  let refused : Option String → Except String (List (Option String))
    | some code => .error code
    | none => .ok earlier
  match definitions start with
  | some code => .error code
  | none =>
    match start.trigger with
    | .message _ => refused (if interrupting then some "scope.eventSubProcess.interruptingMessage" else none)
    | .timer _ => .ok earlier
    | .error _ => refused (if interrupting then none else some "start.error.nonInterrupting")
    | .signal _ => .ok earlier
    | .condition _ => .ok earlier
    | .escalation trigger => escalationDeclared "scope.eventSubProcess.escalationDuplicate" earlier trigger.code
    | .compensation => .ok earlier
    | .cancel => .ok earlier

def eventSubProcess (start : Subscription) (interrupting : Bool) : Option String :=
  match eventSubProcessAfter [] start interrupting with
  | .error code => some code
  | .ok _ => none

/-- The Event Sub-Processes one scope declares, as their starts in document order, taken together. -/
def eventSubProcessDeclarations (starts : List (Subscription × Bool)) : Option String :=
  match starts.foldlM (fun earlier (start, interrupting) => eventSubProcessAfter earlier start interrupting) [] with
  | .error code => some code
  | .ok _ => none

def catchEvent (options : ProfileOptions) (reading : Reading) (subscription : Subscription) : Option String :=
  definitions subscription <|> subscriptionOutputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timerAt options reading false trigger
  | .message trigger => correlatedCatch options reading subscription trigger
  | .signal _ => some "event.catch.signal"
  | .condition trigger => conditionRefusal options reading trigger
  | .error _ => some "event.catch.error"
  | .escalation _ => some "event.catch.escalation"
  | .compensation => some "event.catch.compensation"
  | .cancel => some "event.catch.cancel"

/-- `transactionHost` says whether the boundary hangs on a Transaction. An Error boundary always interrupts (BPMN 2.0.2
Table 10.90) (PC-ERROR-01); a Cancel boundary always interrupts and hangs only on a Transaction (Table 10.90, §10.3.5;
`BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). `seen.errorCodes` holds the codes of the host's Error boundaries
before this one, and an admitted Error boundary adds its own. Two with one code are refused: BPMN 2.0.2 §10.5.6
allows one interrupting handler per Event Declaration and states no precedence between two declarations of one code,
so the kernel restricts a host to one boundary per code, and CIB's first in document order (`BpmnParse:3646`) is not
adopted (PC-ERROR-01). `seen.escalations` holds the host's earlier Escalation boundary codes (`escalationDeclared`). -/
def boundary (options : ProfileOptions) (reading : Reading) (transactionHost : Bool) (seen : Declared)
    (boundary : Boundary) : Except String Declared :=
  let variables := options.errorCatchVariables
  let check (refusal : Option String) : Except String Declared :=
    match refusal with
    | some code => .error code
    | none => .ok seen
  match definitions boundary.subscription <|> subscriptionOutputs boundary.subscription with
  | some code => .error code
  | none =>
    match boundary.subscription.trigger with
    | .timer trigger => check (timerAt options reading false trigger)
    | .message trigger => do
      let seen ← check (message options reading false trigger)
      -- CIB refuses two Message subscriptions of one name in one event scope (`BpmnParse.java:1277-1282`).
      match options.messageNames, trigger.name with
      | .addresses, some (.literal name) =>
        if seen.messageNames.contains name then .error "message.duplicateName"
        else .ok { seen with messageNames := name :: seen.messageNames }
      | .addresses, some (.expression _) | .addresses, none | .description, _ => .ok seen
    | .signal _ => .error "boundary.signal"
    | .condition trigger => check (conditionRefusal options reading trigger)
    | .error trigger => do
      let seen ← check ((if boundary.interrupting then none else some "boundary.error.nonInterrupting") <|>
        errorTrigger variables trigger)
      match trigger.code with
      | some code =>
        if seen.errorCodes.contains code then .error "boundary.error.duplicateCode"
        else .ok { seen with errorCodes := code :: seen.errorCodes }
      | none => .ok seen
    | .escalation trigger => do
      let seen ← check (escalationTrigger variables trigger)
      let escalations ← escalationDeclared "boundary.escalation.duplicate" seen.escalations trigger.code
      .ok { seen with escalations }
    | .compensation => .ok seen
    | .cancel =>
      check (if !transactionHost then some "boundary.cancel.host"
        else if boundary.interrupting then none
        else some "boundary.cancel.nonInterrupting")

def boundaries (options : ProfileOptions) (reading : Reading) (transactionHost : Bool) (list : List Boundary) :
    Option String :=
  match list.foldlM (boundary options reading transactionHost) {} with
  | .error code => some code
  | .ok _ => none

/-- A triggered start. At process level (`nested = false`) the start input names it; nested, it is an Event
Sub-Process start, which may also repeat a cycle and catch what `Kernel.Feature.Propagation` raises. -/
def start (options : ProfileOptions) (reading : Reading) (nested : Bool) (subscription : Subscription) :
    Option String :=
  let variables := options.errorCatchVariables
  let raised (code : String) : Option String := if nested then none else some code
  definitions subscription <|> subscriptionOutputs subscription <|>
  match subscription.trigger with
  | .timer trigger => timerAt options reading (!nested) trigger
  | .message trigger =>
    (if !nested && !subscription.outputs.isEmpty then some "start.message.outputs" else none) <|>
      message options reading (!nested) trigger
  | .signal _ => some "start.signal"
  | .condition trigger => if nested then conditionRefusal options reading trigger else some "start.condition"
  | .error trigger => raised "start.error" <|> errorTrigger variables trigger
  | .escalation trigger => raised "start.escalation" <|> escalationTrigger variables trigger
  | .compensation => raised "start.compensation"
  | .cancel => some "start.cancel"

end Kernel.Admission.Subscriptions
