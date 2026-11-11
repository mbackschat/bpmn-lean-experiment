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

/-- What admission reads of a work kind, read in one place (`traits`): whether the work carries mappings (a plain
Task's only where `readsOwnScope` holds; a decision task's, since `Kernel.Feature.Work.evaluateDecision` writes its
result and maps its outputs, PC-AUTO-08), whether it may be a compensation subject, which completes through the
pipeline's `Hooks.completed` that `Kernel.Feature.Work` reaches for a single User Task or Service Task only, what one
Multi-Instance instance submits (`instanceBody`), whether an occurrence no token began may do it
(`beginsWithoutToken`), the names CIB installs from it (`declaredNames`) and the delegate token it binds. -/
structure Traits where
  mapsData : Bool := false
  plainTask : Bool := false
  compensable : Bool := false
  instanceBody : Option Bool := none
  beginsWithoutToken : Bool := false
  names : List String := []
  handlerKey : Option String := none

/-- The targets of the mappings CIB itself performs: every one except a BPMN Data Association, which it never runs. -/
def writtenTargets (mappings : List Mapping) : List String :=
  (mappings.filter (·.dialect != .dataAssociation)).map (·.target)

/-- A User Task submits the loop's output data item; a Service Task's effect result is the empty OutputSet, since a
Multi-Instance Activity has no mappings (PC-MI-02); a Receive Task's delivery carries no payload (PC-HUM-06). The
Multi-Instance shape itself is admitted by `Kernel.Admission.MultiInstance`. -/
def traits : Work → Traits
  | .none => { plainTask := true, beginsWithoutToken := true }
  | .manual => { beginsWithoutToken := true }
  | .user task =>
    { mapsData := true, compensable := true, instanceBody := some true, beginsWithoutToken := true
      names := task.formFields.map (·.1) }
  | .receive _ => { instanceBody := some false }
  | .service work =>
    { mapsData := true, compensable := true, instanceBody := some false, beginsWithoutToken := true
      handlerKey := work.handlerKey }
  | .send work => { handlerKey := work.handlerKey }
  | .script work => { names := work.resultVariable.toList }
  | .rule work => { mapsData := true, names := work.resultVariable.toList }
  | .call work => { names := writtenTargets (work.inputs ++ work.outputs) }

/-- The work one instance of a Multi-Instance Activity may do: `some submits`, where `submits` says whether its
completion submits the loop's output data item, or `none` for work no instance may do. -/
def instanceBody (work : Work) : Option Bool := (traits work).instanceBody

/-- The work an occurrence no token began may do: a task without work, a User Task or a Service Task. -/
def beginsWithoutToken (work : Work) : Bool := (traits work).beginsWithoutToken

/-- A plain Task completes with the empty submission, so its outputs have a source only under
`OutputContext.activityScope` (CIB-EXT-0031), and only as `camunda:outputParameter`s: CIB parses those on any task
(`BpmnParse.java:4825-4831`), makes the Task a scope (`:4801-4815`) and runs them when its execution ends
(`ExecutionEntity.java:521-525`), as for a User or Service Task. -/
def readsOwnScope (options : ProfileOptions) (outputs : List Mapping) : Bool :=
  options.outputContext == .activityScope && outputs.all (·.dialect == .ioParameter)

def workEnvelope (options : ProfileOptions) (work : Traits) (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty && !work.mapsData then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty && !work.mapsData && !(work.plainTask && readsOwnScope options envelope.outputs) then
    some "activity.outputMappings"
  else if envelope.multiInstance.isSome && work.instanceBody.isNone then some "activity.multiInstanceBody"
  else if envelope.compensationHandler.isSome && (!work.compensable || envelope.multiInstance.isSome) then
    some "activity.compensationHandler"
  else none

/-- The names CIB installs from the model as variables an expression may read: every element's parameter targets and
loop item names, and its work's names (`traits`). A process-level item is none, since CIB parses no Property, Data
Object or process I/O specification (`BpmnParse.java:726`). -/
def declaredNames (program : Program) : List String :=
  program.elements.flatMap fun element =>
    let loop := (element.envelope?).bind (·.multiInstance)
    ((element.envelope?).map (fun envelope => writtenTargets (envelope.inputs ++ envelope.outputs))).getD [] ++
      ((loop.map fun loop => loop.elementVariable.toList ++ loop.inputDataItem.toList ++
        loop.inputDataItemName.toList).getD []) ++
      ((element.activity?).map (fun (_, payload) => (traits payload.work).names)).getD []

/-- CIB resolves a delegate token against the variables before its beans (`JuelExpressionManager.java:144-150`), so a
declared name equal to it shadows the handler and the job fails (CIB-LIM-0017). -/
def handlerKey (program : Program) : Option String → Option String
  | none => none
  | some token => if (declaredNames program).contains token then some "work.handlerKeyName" else none

/-- An instantiating Receive Task starts its Process (BPMN 2.0.2 §10.3.3, Table 10.10), which pinned CIB never reads
(CIB-LIM-0008) (PC-BASIC-04). Under name addressing a Receive Task with a Message subscribes by its name as a Message
Event does (`BpmnParse.java:2753-2759`), so a missing or blank name is refused (CIB-LIM-0022). -/
def receive (options : ProfileOptions) (work : ReceiveWork) : Option String :=
  let unnamed := options.messageNames == .addresses && work.message.messageRef.isSome
  if work.instantiate then some "work.receive.instantiate"
  else if !work.message.correlation.isEmpty then some "work.receive.correlation"
  else
    match work.message.name with
    | none => if unnamed then some "message.unnamed" else none
    | some (.literal text) => if unnamed && text.toList.all (· ≤ ' ') then some "message.unnamed" else none
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
(PC-SCOPE-04). `loopCounter` is not among them: CIB's list holds only the three instance counts. -/
def multiInstanceCounters : List String := multiInstanceCounterNames.erase "loopCounter"

/-- A Call names a called process literally that the program carries, not the root process, binds the latest version, carries no business key or tenant and maps its data explicitly; its mappings
live in `CallWork`, never in the envelope. Under `CalledElementResolution.qualifiedName` the literal is a QName, and one
whose prefix has no namespace binding names nothing (`Semantic.xsd:149`). A carried process must answer the name before
the binding is read, and exactly one the whole selector (`Program.calledProcessFor`, PC-SCOPE-03). -/
def call (program : Program) (work : CallWork) : Option String :=
  let resolution := program.options.calledElementResolution
  let deployment := program.identity.deployment
  let element : Option String :=
    match work.calledElement with
    | .literal _ =>
      if resolution == .qualifiedName && work.calledQName.isNone then some "work.call.calledElementUnbound"
      else if program.callsRoot resolution work then some "work.call.rootProcess"
      else if program.processes.any (fun process =>
          process.definition.eligibleFor deployment && work.namesDefinition resolution process.definition) then none
      else some "work.call.calledProcessMissing"
    | .expression _ => some "work.call.calledElementExpression"
  let binding : Option String :=
    match work.binding with
    | .latest => none
    | .deployment => some "work.call.binding"
    | .version _ => some "work.call.binding"
    | .versionTag _ => some "work.call.binding"
  let selected : Option String :=
    match program.calledProcessFor resolution deployment work with
    | [_] => none
    | [] => some "work.call.calledProcessMissing"
    | _ :: _ :: _ => some "work.call.ambiguous"
  element <|> binding <|> selected <|>
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
  !value.startsWith "+" && (parseJavaInt? value).isSome

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
    | .receive work => receive program.options work
    | .service work => service work
    | .send _ => some "work.send"
    | .script _ => some "work.script"
    | .rule work => Decision.task program work payload.envelope
    | .call work => call program work
  let read := traits payload.work
  work <|> handlerKey program read.handlerKey <|> workEnvelope program.options read payload.envelope

end Kernel.Admission.Work
