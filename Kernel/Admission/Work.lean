module

public import Kernel.IL.Types
public import Kernel.Admission.Work.Decision

/-! # Admission of Activities. A refusal carries a stable code.

Boundaries are admitted by `Kernel.Admission.Subscriptions` through the admission registry. Input and output
mappings are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs,
an effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an
effect's result patch); elsewhere `Kernel.Feature.Work` would evaluate a mapping and drop its binding. A plain Task's
completion submits nothing, so its output parameters are admitted only where they read the Task's own scope
(`readsOwnScope`).
-/

public section

namespace Kernel.Admission.Work

/-- Whether `work` carries mappings. A plain Task carries them when `plainTask` holds (`readsOwnScope`); a decision
task when `decisionTask` holds, since `Kernel.Feature.Work.evaluateDecision` writes its result and maps its outputs
(PC-AUTO-08), though no compensation subject completes through it. -/
def mapsData (plainTask decisionTask : Bool) : Work → Bool
  | .user _ => true
  | .service _ => true
  | .none => plainTask
  | .manual => false
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => decisionTask
  | .call _ => false

/-- The work one instance of a Multi-Instance Activity may do: `some submits`, where `submits` says whether its
completion submits the loop's output data item, or `none` for work no instance may do. A User Task submits it; a
Service Task's effect result is the empty OutputSet, since a Multi-Instance Activity has no mappings (PC-MI-02); a
Receive Task's delivery carries no payload (PC-HUM-06). The Multi-Instance shape itself is admitted by
`Kernel.Admission.MultiInstance`. -/
def instanceBody : Work → Option Bool
  | .user _ => some true
  | .service _ => some false
  | .receive _ => some false
  | .none => none
  | .manual => none
  | .send _ => none
  | .script _ => none
  | .rule _ => none
  | .call _ => none

/-- The work an occurrence no token began may do: a task without work, a User Task or a Service Task. -/
def beginsWithoutToken : Work → Bool
  | .none => true
  | .manual => true
  | .user _ => true
  | .service _ => true
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- A plain Task completes with the empty submission, so its outputs have a source only under
`OutputContext.activityScope` (CIB-EXT-0031), and only as `camunda:outputParameter`s: CIB parses those on any task
(`BpmnParse.java:4825-4831`), makes the Task a scope (`:4801-4815`) and runs them when its execution ends
(`ExecutionEntity.java:521-525`), as for a User or Service Task. -/
def readsOwnScope (options : ProfileOptions) (outputs : List Mapping) : Bool :=
  options.outputContext == .activityScope && outputs.all (·.dialect == .ioParameter)

def envelope (options : ProfileOptions) (work : Work) (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty && !mapsData false true work then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty && !mapsData (readsOwnScope options envelope.outputs) true work then
    some "activity.outputMappings"
  else if envelope.multiInstance.isSome && (instanceBody work).isNone then some "activity.multiInstanceBody"
  -- A compensation subject completes through the pipeline's `Hooks.completed`, which `Kernel.Feature.Work` reaches for a
  -- single User Task or Service Task only.
  else if envelope.compensationHandler.isSome && (!mapsData false false work || envelope.multiInstance.isSome) then
    some "activity.compensationHandler"
  else none

/-- An instantiating Receive Task starts its Process (BPMN 2.0.2 §10.3.3, Table 10.10), which pinned CIB never reads
(CIB-LIM-0008) (PC-BASIC-04). -/
def receive (work : ReceiveWork) : Option String :=
  if work.instantiate then some "work.receive.instantiate"
  else if !work.message.correlation.isEmpty then some "work.receive.correlation"
  else
    match work.message.name with
    | none => none
    | some (.literal _) => none
    | some (.expression _) => some "work.receive.messageExpression"

/-- The called process's Data Associations correspond to the Call's by position (BPMN 2.0.2 §10.3.6): the kernel reads
exactly one input and one output Data Association, the scalar interface the reader resolves; anything else, or a mix
with CIB variable mappings, has no correspondence it could read. -/
def dataCorrespondence (work : CallWork) : Option String :=
  let isData (mapping : Mapping) : Bool := mapping.dialect == .dataAssociation
  let mappings := work.inputs ++ work.outputs
  if mappings.any isData && (work.inputs.length != 1 || work.outputs.length != 1 || !mappings.all isData) then
    some "work.call.dataCorrespondence"
  else none

/-- CIB drops a Call output whose target is a Multi-Instance counter before writing it
(`CallableElementActivityBehavior.java:48,135,160-166`); the counters belong to the loop (BPMN 2.0.2 Table 10.30)
(PC-SCOPE-04). -/
def multiInstanceCounters : List String := ["nrOfInstances", "nrOfActiveInstances", "nrOfCompletedInstances"]

/-- A Call names a called process literally that the program carries, not the root process and without an Event
Sub-Process, binds the latest version, carries no business key or tenant and maps its data explicitly; its mappings
live in `CallWork`, never in the envelope. -/
def call (program : Program) (work : CallWork) : Option String :=
  let element : Option String :=
    match work.calledElement with
    | .literal id =>
      if id == program.identity.processId then some "work.call.rootProcess"
      else
        match program.calledProcess? id with
        | some process =>
          if (program.processChildren process).any (fun child =>
              (child.scope?.bind fun (_, scope) => scope.kind.start?).isSome) then
            some "call.calledEventSubProcess"
          else none
        | none => some "work.call.calledProcessMissing"
    | .expression _ => some "work.call.calledElementExpression"
  let binding : Option String :=
    match work.binding with
    | .latest => none
    | .deployment => some "work.call.binding"
    | .version _ => some "work.call.binding"
    | .versionTag _ => some "work.call.binding"
  element <|> binding <|>
    (if work.outputs.any (multiInstanceCounters.contains ·.target) then some "work.call.multiInstanceCounterOutput"
     else if work.businessKey.isSome then some "work.call.businessKey"
     else if work.tenant.isSome then some "work.call.tenant"
     else if work.propagateAllInputs || work.propagateAllOutputs then some "work.call.propagateAll"
     else dataCorrespondence work)

/-- A model string CIB evaluates as an expression: it holds `${` or `#{`, the reader's own marker. -/
def expressionText (value : String) : Bool :=
  let rec go : List Char → Bool
    | marker :: rest@('{' :: _) => marker == '$' || marker == '#' || go rest
    | _ :: rest => go rest
    | [] => false
  go value.toList

/-- The number the `count` decimal digits of `chars` from `start` spell, when they are all digits. -/
def digitsAt (chars : List Char) (start count : Nat) : Option Nat :=
  let part := (chars.drop start).take count
  if part.length == count && part.all Char.isDigit then some (part.foldl (fun n c => n * 10 + (c.toNat - '0'.toNat)) 0)
  else none

def daysIn (year month : Nat) : Nat :=
  if month == 2 then (if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) then 29 else 28)
  else if month == 4 || month == 6 || month == 9 || month == 11 then 30
  else 31

/-- `YYYY-MM-DDTHH:MM:SSZ`, a calendar instant in UTC: the one date form CIB reads as the same instant on every
engine, since it reads a form without offset in the JVM's zone and one starting with `P` as a duration from now
(`DueDateBusinessCalendar#resolveDuedate`, `DateTimeUtil#parseDate`), and its projection prints it back unchanged. -/
def utcInstant (value : String) : Bool :=
  let chars := value.toList
  let charAt (index : Nat) (char : Char) : Bool := chars[index]? == some char
  match digitsAt chars 0 4, digitsAt chars 5 2, digitsAt chars 8 2, digitsAt chars 11 2, digitsAt chars 14 2,
      digitsAt chars 17 2 with
  | some year, some month, some day, some hour, some minute, some second =>
    chars.length == 20 && charAt 4 '-' && charAt 7 '-' && charAt 10 'T' && charAt 13 ':' && charAt 16 ':' && charAt 19 'Z' &&
      0 < year &&
      0 < month && month ≤ 12 && 0 < day && day ≤ daysIn year month && hour < 24 && minute < 60 && second < 60
  | _, _, _, _, _, _ => false

/-- A decimal Java `int`, optionally negative: CIB parses a literal priority with `Integer.parseInt`
(`TaskDecorator#initializeTaskPriority`); a `+` sign, which Java also reads, is refused rather than carried. -/
def javaInt (value : String) : Bool :=
  let digits := match value.toList with
    | '-' :: rest => rest
    | chars => chars
  !digits.isEmpty && digits.all Char.isDigit &&
    match value.toInt? with
    | some number => decide (-2147483648 ≤ number) && decide (number ≤ 2147483647)
    | none => false

/-- A field's literal value satisfies `admitted`; an expression waits for the Task fields JUEL level. -/
def literalField (admitted : String → Bool) : Option ValueSource → Bool
  | none => true
  | some (.literal value) => admitted value
  | some (.expression _) => false

/-- CIB's built-in form field types without configuration (`ProcessEngineConfigurationImpl#initFormTypes`); an `enum`
field's values are not carried. CIB refuses a field without an id or type at deployment
(`DefaultFormHandler#parseFormField`, `FormTypes#parseFormPropertyType`). -/
def formFieldTypes : List String := ["string", "long", "boolean", "date"]

/-- The User Task fields the kernel reads are literal (PC-HUM-02); each expression-valued field waits for the Task
fields JUEL level, a relative or zoned date and a non-decimal priority stay refused. -/
def userTask (task : UserWork) : Option String :=
  let always (_ : String) : Bool := true
  if !literalField always task.assignee then some "work.user.assignee"
  else if !task.candidateUsers.all (literalField always ∘ some) then some "work.user.candidateUsers"
  else if (task.formKey.map expressionText).getD false then some "work.user.formKey"
  else if !literalField utcInstant task.dueDate then some "work.user.dueDate"
  else if !literalField utcInstant task.followUpDate then some "work.user.followUpDate"
  else if !literalField javaInt task.priority then some "work.user.priority"
  else if !task.candidateGroups.all (literalField always ∘ some) then some "work.user.candidateGroupExpression"
  else if task.formFields.any (fun (key, type) => key.isEmpty || !formFieldTypes.contains type) then
    some "work.user.formField"
  else none

def service (work : ServiceWork) : Option String :=
  if work.protocol.isEmpty || work.operation.isEmpty then some "work.service.unboundImplementation" else none

def activity (program : Program) (payload : ActivityPayload) : Option String :=
  let work : Option String :=
    match payload.work with
    | .none => none
    | .manual => none
    | .user task => userTask task
    | .receive work => receive work
    | .service work => service work
    | .send _ => some "work.send"
    | .script _ => some "work.script"
    | .rule work => Decision.task program work
    | .call work => call program work
  work <|> envelope program.options payload.work payload.envelope

end Kernel.Admission.Work
