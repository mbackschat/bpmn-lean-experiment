module

public import Kernel.IL.Types
public import Kernel.IL.Timer

/-! # Admission of catch Events, boundaries and Event Sub-Process starts. A refusal carries a stable code.

`Kernel.Admission.Subscriptions.Starts` dispatches a start Event's trigger and hands an Event Sub-Process start's Signal
to `eventSubProcessSignal`.

Admitted: Timers with a literal `Kernel.Timer.classify` admits, Messages with a literal name and no
correlation, a correlated Message only on a catch Event, a Signal catch with a resolvable address, and, on boundaries, the triggers that
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

/-- A Signal's address (PC-SIGNAL-01, PC-SIGNAL-02), shared by catches, starts and throws. Every event names its Signal
by `signalRef` (`BpmnParse.java:3536-3545`). Under `SignalNames.identifier` that QName is the address and the name a
description, which BPMN 2.0.2 gives no expression (`tSignal.name` is `xsd:string`). Under `addresses` CIB keys by the
name (CIB-INT-0028): a missing or blank one is refused (`BpmnParse.java:487-488`), and an expression is read at the
Events level (CIB-EXT-0041), except at a root start, which CIB resolves at deployment against an empty scope
(`EventSubscriptionDeclaration.java:137-142`). -/
def signalAddress (options : ProfileOptions) (reading : Reading) (rootStart : Bool) (signalRef : Option QName)
    (name : Option ValueSource) : Option String :=
  if signalRef.isNone then some "signal.unspecified"
  else
    match options.signalNames, name with
    | .identifier, some (.expression _) => some "signal.nameExpression"
    | .identifier, _ => none
    | .addresses, none => some "signal.unnamed"
    | .addresses, some (.literal text) => if text.toList.all (· ≤ ' ') then some "signal.unnamed" else none
    | .addresses, some (.expression body) =>
      if rootStart then some "start.signalNameExpression" else eventsExpression options reading "signal.nameExpression" body

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

/-- The codes of the raised-event catchers one place declared before the one being admitted: the boundaries of a host,
or the Event Sub-Processes of a scope; `none` is an Escalation catch-all. -/
structure Declared where
  errorCodes : List String := []
  escalations : List (Option String) := []

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

/-- At most one interrupting Error catcher of one kind in one place per exact code: among the boundaries of a host, or
among the Event Sub-Processes of a scope, a second one of a code in `earlier` is refused as `refusal`, and an admitted
code joins `earlier`. BPMN 2.0.2 §10.5.6 allows one interrupting handler per Event Declaration ("only one Event
Sub-Process for the same Event Declaration MUST be modeled") and orders no two of one code; CIB keeps them and catches
with the first in document order (`BpmnParse.java:3645-3650`, a stable sort by precedence), which is not adopted, so
they are refused under every profile (PC-ERROR-01, PC-ERROR-02). A catch-all (`none`) is never refused: catch-alls of
one place catch in document order (CIB-INT-0010). -/
def errorDeclared (refusal : String) (earlier : List String) : Option String → Except String (List String)
  | some code => if earlier.contains code then .error refusal else .ok (code :: earlier)
  | none => .ok earlier

/-- An interrupting Event Sub-Process started by a Message has no selected meaning for the Scope it interrupts; an Error
Event Sub-Process always interrupts (BPMN 2.0.2 Table 10.86, Table 10.87 `isInterrupting`, §13.5.4) (PC-ERROR-02).
`seen` holds the Error and Escalation codes of the Event Sub-Processes the same scope declared before this one
(`errorDeclared`, `escalationDeclared`). -/
def eventSubProcessAfter (seen : Declared) (start : Subscription) (interrupting : Bool) : Except String Declared :=
  let refused : Option String → Except String Declared
    | some code => .error code
    | none => .ok seen
  match definitions start with
  | some code => .error code
  | none =>
    match start.trigger with
    | .message _ => refused (if interrupting then some "scope.eventSubProcess.interruptingMessage" else none)
    | .timer _ => .ok seen
    | .error trigger => do
      let seen ← refused (if interrupting then none else some "start.error.nonInterrupting")
      let errorCodes ← errorDeclared "scope.eventSubProcess.errorDuplicateCode" seen.errorCodes trigger.code
      .ok { seen with errorCodes }
    | .signal _ => .ok seen
    | .condition _ => .ok seen
    | .escalation trigger => do
      let escalations ← escalationDeclared "scope.eventSubProcess.escalationDuplicate" seen.escalations trigger.code
      .ok { seen with escalations }
    | .compensation => .ok seen
    | .cancel => .ok seen

def eventSubProcess (start : Subscription) (interrupting : Bool) : Option String :=
  match eventSubProcessAfter {} start interrupting with
  | .error code => some code
  | .ok _ => none

/-- The Event Sub-Processes one scope declares, as their starts in document order, taken together. -/
def eventSubProcessDeclarations (starts : List (Subscription × Bool)) : Option String :=
  match starts.foldlM (fun seen (start, interrupting) => eventSubProcessAfter seen start interrupting) {} with
  | .error code => some code
  | .ok _ => none

/-- What admission reads of a subscription's trigger: its refusal, and the Signal it subscribes to, which
`signalNames` and `signalDefinitionNames` compare across the program. -/
structure Admitted where
  refusal : Option String
  signal : Option SignalTrigger := none

/-- The one dispatch on a catch Event's trigger. -/
def caught (options : ProfileOptions) (reading : Reading) (subscription : Subscription) : Admitted :=
  let refusing (refusal : Option String) : Admitted := { refusal }
  match subscription.trigger with
  | .timer trigger => refusing (timerAt options reading false trigger)
  | .message trigger => refusing (correlatedCatch options reading subscription trigger)
  | .signal trigger =>
    { refusal := signalAddress options reading false trigger.signalRef trigger.name, signal := some trigger }
  | .condition trigger => refusing (conditionRefusal options reading trigger)
  | .error _ => refusing (some "event.catch.error")
  | .escalation _ => refusing (some "event.catch.escalation")
  | .compensation => refusing (some "event.catch.compensation")
  | .cancel => refusing (some "event.catch.cancel")

def catchEvent (options : ProfileOptions) (reading : Reading) (subscription : Subscription) : Option String :=
  definitions subscription <|> subscriptionOutputs subscription <|> (caught options reading subscription).refusal

/-- What a boundary's admission reads of its host: whether it is a Transaction, and whether an Escalation boundary may
hang on it. Pinned CIB admits an Escalation boundary only on a Sub-Process (a Transaction counts as one,
`BpmnParse.java:3879`, `:3908`), a Call Activity or a User Task and refuses the deployment otherwise
(`BpmnParse.java:3335-3342`). BPMN 2.0.2 §10.5.6 restricts no host, so another host lies outside the target and is
refused under every profile (`boundary.escalation.host`, PC-ESCALATION-02). -/
structure Host where
  transaction : Bool
  escalation : Bool

/-- `host` says what the boundary hangs on (`Host`). An Error boundary always interrupts (BPMN 2.0.2
Table 10.90) (PC-ERROR-01); a Cancel boundary always interrupts and hangs only on a Transaction (Table 10.90, §10.3.5;
`BpmnParse#parseBoundaryCancelEventDefinition`) (PC-TX-02). `seen` holds the host's earlier Error boundary codes
(`errorDeclared`) and Escalation boundary codes (`escalationDeclared`). -/
def boundary (options : ProfileOptions) (reading : Reading) (host : Host) (seen : Declared)
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
    | .message trigger => check (message options reading false trigger)
    | .signal _ => .error "boundary.signal"
    | .condition trigger => check (conditionRefusal options reading trigger)
    | .error trigger => do
      let seen ← check ((if boundary.interrupting then none else some "boundary.error.nonInterrupting") <|>
        errorTrigger variables trigger)
      let errorCodes ← errorDeclared "boundary.error.duplicateCode" seen.errorCodes trigger.code
      .ok { seen with errorCodes }
    | .escalation trigger => do
      let seen ← check ((if host.escalation then none else some "boundary.escalation.host") <|>
        escalationTrigger variables trigger)
      let escalations ← escalationDeclared "boundary.escalation.duplicate" seen.escalations trigger.code
      .ok { seen with escalations }
    | .compensation => .ok seen
    | .cancel =>
      check (if !host.transaction then some "boundary.cancel.host"
        else if boundary.interrupting then none
        else some "boundary.cancel.nonInterrupting")

def boundaries (options : ProfileOptions) (reading : Reading) (host : Host) (list : List Boundary) :
    Option String :=
  match list.foldlM (boundary options reading host) {} with
  | .error code => some code
  | .ok _ => none

/-- The event scope CIB declares a Message or Signal subscription in (`BpmnParse#addEventSubscriptionDeclaration`,
`BpmnParse.java:1271-1295`): a process level (the root for `none`, else the called process of that definition), an
element, or the Multi-Instance body of a looping host. -/
inductive EventScope where
  | process (definition : Option DefinitionRef)
  | element (id : ElementId)
  | body (host : ElementId)
  deriving DecidableEq

/-- A Message or Signal subscription as CIB declares it: its event scope, its `isStartEvent` mark, which only a root
start sets (`BpmnParse.java:1029`, `:3518`), and its trigger. -/
structure Site (α : Type) where
  scope : EventScope
  start : Bool
  trigger : α

/-- Under `MessageNames.addresses` two Message subscriptions of one event scope and one start mark may not share a name:
CIB refuses the second at deployment when its unresolved name text equals the first's
(`hasMultipleEventDefinitionsWithSameName`, `BpmnParse.java:1277-1282`, `:1317-1327`). `sites` are every Message
subscription of the program. A literal name compares by its text. Admission cannot compare expression texts: the IL
keeps an expression's parsed form, a guarded JUEL table, not its text. So two expression names on one Message, which
has one name text, are `message.duplicateName`, and two on different Messages are refused as `message.expressionNames`
rather than guessed, which also refuses pairs of different texts that CIB deploys (PC-MESSAGE-01). A literal never
collides with an expression: the reader reads every text holding `${` or `#{` as an expression. -/
def messageNames (options : ProfileOptions) (sites : List (Site MessageTrigger)) : Option String :=
  let clash (earlier site : Site MessageTrigger) : Option String :=
    if earlier.scope != site.scope || earlier.start != site.start then none
    else
      match earlier.trigger.name, site.trigger.name with
      | some (.literal left), some (.literal right) => if left == right then some "message.duplicateName" else none
      | some (.expression _), some (.expression _) =>
        some (if earlier.trigger.messageRef == site.trigger.messageRef then "message.duplicateName"
          else "message.expressionNames")
      | _, _ => none
  if options.messageNames != .addresses then none
  else sites.zipIdx.findSome? fun (site, index) => (sites.take index).findSome? (clash · site)

/-- Two Signal names compare as CIB compares their texts: a literal by its text, an expression by its parsed form, which
the IL keeps instead of the text. Derived `Repr` makes that exact structural equality without a dispatch over the
guarded JUEL types (as `startConditions`), and it equates only texts that differ in layout, which CIB keeps apart. The
reader reads every text holding `${` or `#{` as an expression, so a literal never equals an expression. -/
def sameSignalName (left right : SignalTrigger) : Bool :=
  left.name.isSome && reprStr left.name == reprStr right.name

/-- Under `SignalNames.addresses` two Signals the program references may not share a name (`signal.duplicateDefinitionName`,
CIB-LIM-0026): CIB refuses a document declaring two (`BpmnParse.java:479-482`). `signals` are every Signal the
program's subscriptions and throws reference; a Signal no event references never reaches the IL. -/
def signalDefinitionNames (options : ProfileOptions) (signals : List SignalTrigger) : Option String :=
  if options.signalNames != .addresses then none
  else if signals.zipIdx.any fun (signal, index) => (signals.take index).any fun earlier =>
      earlier.signalRef != signal.signalRef && sameSignalName earlier signal then some "signal.duplicateDefinitionName"
  else none

/-- Under `SignalNames.addresses` two Signal subscriptions of one event scope and one start mark may not share a name
(`signal.duplicateName`, CIB-LIM-0026): CIB refuses the second at deployment when its unresolved name text equals the
first's (`hasMultipleSignalEventDefinitionsWithSameName`, `BpmnParse.java:1284-1288`, `:1301-1303`, `:1317-1328`), so
two root Signal starts of one process on one Signal are refused, which BPMN 2.0.2 admits (§13.2). `sites` are every
Signal subscription of the program, compared by `sameSignalName`. -/
def signalNames (options : ProfileOptions) (sites : List (Site SignalTrigger)) : Option String :=
  if options.signalNames != .addresses then none
  else if sites.zipIdx.any fun (site, index) => (sites.take index).any fun earlier =>
      earlier.scope == site.scope && earlier.start == site.start && sameSignalName earlier.trigger site.trigger then
    some "signal.duplicateName"
  else none

/-- The Signal of an Event Sub-Process start, which `start` (`Kernel.Admission.Subscriptions.Starts`) hands here:
refused, as every Signal subscription is. -/
def eventSubProcessSignal (_ : SignalTrigger) : Option String := some "start.signal"

end Kernel.Admission.Subscriptions
