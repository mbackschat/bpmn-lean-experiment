module

public import Kernel.IL.Types

/-! # Admission of Activities. A refusal carries a stable code.

Boundaries are admitted by `Kernel.Admission.Subscriptions` through the admission registry. Input and output
mappings are admitted only on the work kinds whose item carries the evaluated inputs (a User Task's published inputs,
an effect's arguments) and whose completion submits the values the outputs read (a User Task's submission, an
effect's result patch); elsewhere `Kernel.Feature.Work` would evaluate a mapping and drop its binding.
-/

public section

namespace Kernel.Admission.Work

def mapsData : Work → Bool
  | .user _ => true
  | .service _ => true
  | .none => false
  | .manual => false
  | .receive _ => false
  | .send _ => false
  | .script _ => false
  | .rule _ => false
  | .call _ => false

/-- The work one instance of a Multi-Instance Activity may do: `some submits`, where `submits` says whether its
completion submits the loop's output data item, or `none` for work no instance may do. A User Task submits it; a
Service Task's effect result is the empty OutputSet, since a Multi-Instance Activity has no mappings (PC-MI-02). The
Multi-Instance shape itself is admitted by `Kernel.Admission.MultiInstance`. -/
def instanceBody : Work → Option Bool
  | .user _ => some true
  | .service _ => some false
  | .none => none
  | .manual => none
  | .receive _ => none
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

/-- What a branch of a structured Inclusive region may hold (`Kernel.Admission.Flow.BranchWork`): a User or Service Task,
which arms the branch, or a task without work; any other work is outside the reviewed region (PC-CF-04). -/
def branchContent (work : Work) : Option Bool :=
  if beginsWithoutToken work then some (mapsData work) else none

def envelope (work : Work) (envelope : Envelope) : Option String :=
  if !envelope.inputs.isEmpty && !mapsData work then some "activity.inputMappings"
  else if !envelope.outputs.isEmpty && !mapsData work then some "activity.outputMappings"
  else if envelope.multiInstance.isSome && (instanceBody work).isNone then some "activity.multiInstanceBody"
  -- A compensation subject completes through the pipeline's `Hooks.completed`, which `Kernel.Feature.Work` reaches for a
  -- single User Task or Service Task only.
  else if envelope.compensationHandler.isSome && (!mapsData work || envelope.multiInstance.isSome) then
    some "activity.compensationHandler"
  else none

def receive (work : ReceiveWork) : Option String :=
  if !work.message.correlation.isEmpty then some "work.receive.correlation"
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

/-- The fields of a User Task the kernel does not yet read. -/
def userTask (task : UserWork) : Option String :=
  if task.assignee.isSome then some "work.user.assignee"
  else if !task.candidateUsers.isEmpty then some "work.user.candidateUsers"
  else if task.formKey.isSome then some "work.user.formKey"
  else if task.dueDate.isSome then some "work.user.dueDate"
  else if task.followUpDate.isSome then some "work.user.followUpDate"
  else if task.priority.isSome then some "work.user.priority"
  else if task.candidateGroups.any (fun
    | .literal _ => false
    | .expression _ => true) then some "work.user.candidateGroupExpression"
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
    | .rule _ => some "work.rule"
    | .call work => call program work
  work <|> envelope payload.work payload.envelope

end Kernel.Admission.Work
