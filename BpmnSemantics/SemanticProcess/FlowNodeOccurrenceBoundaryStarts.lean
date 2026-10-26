module

public import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
public import BpmnSemantics.SemanticProcess.EffectDataMapping
public import BpmnSemantics.SemanticProcess.SequentialScopeRuntime

/-! # Flow-node occurrence boundary starts

This module constructs candidate long-lived lifecycle starts from one exact selected Program operation and the runtime record that operation created. It does not project an open runtime state or validate a lifecycle fold against an after-state oracle.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Closed terminal classification for one semantic flow-node occurrence. -/
inductive FlowNodeOccurrenceTerminalKind where
  | completed
  | cancelled
  deriving Repr, DecidableEq

/-- Semantic-only pairing identity. No constructor is part of the public wire contract. -/
inductive SemanticFlowNodeOccurrenceAnchor where
  | wait (id : OccurrenceId)
  | scope (id : ScopeOccurrenceId)
  | callActivity (id : OccurrenceId)
  | compensationTrigger (id : OccurrenceId)
  | compensationHandler (id : OccurrenceId)
  | transition (commandId : SemanticId) (transitionIndex localIndex : Nat)
  deriving Repr, DecidableEq

/-- Revision-free semantic start awaiting public sequence and time assignment. -/
structure UnnumberedFlowNodeOccurrenceStart where
  anchor : SemanticFlowNodeOccurrenceAnchor
  processId : ProcessId
  elementId : NodeId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

/-- Revision-free terminal paired to one semantic anchor. -/
structure UnnumberedFlowNodeOccurrenceEnd where
  anchor : SemanticFlowNodeOccurrenceAnchor
  terminal : FlowNodeOccurrenceTerminalKind
  deriving Repr, DecidableEq

/-- Atomic starts and terminals selected at one evaluator transition boundary. -/
structure UnnumberedFlowNodeOccurrenceDelta where
  started : List UnnumberedFlowNodeOccurrenceStart
  ended : List UnnumberedFlowNodeOccurrenceEnd
  deriving Repr, DecidableEq

/-- One retained start for which no terminal has been accepted. -/
abbrev OpenSemanticFlowNodeOccurrence := UnnumberedFlowNodeOccurrenceStart

/-- Program-derived Process, element, and runtime owner identity for one instantaneous flow-node unit. -/
structure FlowNodeIdentity where
  processId : ProcessId
  elementId : NodeId
  owner : ScopeOccurrenceId
  deriving Repr, DecidableEq

def exactOperationOwner? (program : Program) (operation : SemanticOperation) :
    Option DefinitionScopeId := do
  let selected ← match program.operations.filter fun candidate =>
      decide (candidate.id = operation.id) with
    | [selected] => some selected
    | _ => none
  if selected ≠ operation then none
  else
    match program.operationScopes.filter fun binding =>
        decide (binding.operationId = operation.id) with
    | [binding] => some binding.scopeId
    | _ => none

def definitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => decide (scope.id = scopeId) with
  | [scope] => some scope
  | _ => none

def processIdForDefinitionScopeWithFuel? (program : Program) :
    Nat → DefinitionScopeId → Option ProcessId
  | 0, _ => none
  | fuel + 1, scopeId => do
      let scope ← definitionScope? program scopeId
      match scope.parentScopeId with
      | none => some ⟨scope.originElementId.value⟩
      | some parent => processIdForDefinitionScopeWithFuel? program fuel parent

/-- Resolve a definition scope to its root Process using only immutable Program bindings. -/
def candidateProcessIdForDefinitionScope? (program : Program)
    (scopeId : DefinitionScopeId) : Option ProcessId :=
  processIdForDefinitionScopeWithFuel? program (program.definitionScopes.length + 1) scopeId

/-- Construct an instantaneous identity from one runtime owner and its immutable Program scope. -/
def candidateFlowNodeIdentity? (program : Program) (owner : ScopeOccurrenceId)
    (elementId : NodeId) : Option FlowNodeIdentity := do
  let processId ← candidateProcessIdForDefinitionScope? program owner.definitionScopeId
  pure { processId, elementId, owner }

/-- Bind an instantaneous identity to the exact selected Program operation and runtime owner. -/
def candidateOperationFlowNodeIdentity? (program : Program) (operation : SemanticOperation)
    (selectedOwner identityOwner : ScopeOccurrenceId) (elementId : NodeId) :
    Option FlowNodeIdentity := do
  let operationScope ← exactOperationOwner? program operation
  if operationScope ≠ selectedOwner.definitionScopeId ||
      identityOwner.processInstanceId ≠ selectedOwner.processInstanceId then none
  else
    let operationProcessId ← candidateProcessIdForDefinitionScope? program operationScope
    let identity ← candidateFlowNodeIdentity? program identityOwner elementId
    if identity.processId ≠ operationProcessId then none else pure identity

/-- Exact same-owner candidate identity follows from immutable operation and scope selection. -/
theorem candidateOperationFlowNodeIdentity_of_exact_selection (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) (elementId : NodeId)
    (processId : ProcessId) (binding : OperationScopeOwnership)
    (operationSelection : program.operations.filter (fun candidate =>
      decide (candidate.id = operation.id)) = [operation])
    (scopeSelection : program.operationScopes.filter (fun candidate =>
      decide (candidate.operationId = operation.id)) = [binding])
    (scopeMatches : binding.scopeId = owner.definitionScopeId)
    (processSelection : candidateProcessIdForDefinitionScope?
      program owner.definitionScopeId = some processId) :
    candidateOperationFlowNodeIdentity? program operation owner owner elementId =
      some { processId, elementId, owner } := by
  simp [candidateOperationFlowNodeIdentity?, exactOperationOwner?, candidateFlowNodeIdentity?,
    operationSelection, scopeSelection, scopeMatches, processSelection]

def processIdForSelectedOperation? (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId) : Option ProcessId := do
  let staticOwner ← exactOperationOwner? program operation
  if staticOwner ≠ owner.definitionScopeId then none
  else candidateProcessIdForDefinitionScope? program staticOwner

def candidateOccurrenceId (processInstanceId : SemanticId) (elementId : NodeId)
    (activation : Nat) : OccurrenceId :=
  { processInstanceId, elementId := ⟨elementId.value⟩, activation }

def candidateWaitStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (processInstanceId : SemanticId) (elementId : NodeId)
    (activation : Nat) : Option UnnumberedFlowNodeOccurrenceStart := do
  let processId ← processIdForSelectedOperation? program operation owner
  if processInstanceId ≠ owner.processInstanceId || activation = 0 then none
  else
    pure
      { anchor := .wait (candidateOccurrenceId processInstanceId elementId activation)
        processId
        elementId
        owner }

/-- Exact candidate wait start from the public immutable-selection and identity facts. -/
theorem candidateWaitStart_of_exact_selection (program : Program)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (processInstanceId : SemanticId) (elementId : NodeId) (activation : Nat)
    (processId : ProcessId) (binding : OperationScopeOwnership)
    (operationSelection : program.operations.filter (fun candidate =>
      decide (candidate.id = operation.id)) = [operation])
    (scopeSelection : program.operationScopes.filter (fun candidate =>
      decide (candidate.operationId = operation.id)) = [binding])
    (scopeMatches : binding.scopeId = owner.definitionScopeId)
    (processSelection : candidateProcessIdForDefinitionScope?
      program owner.definitionScopeId = some processId)
    (ownerMatches : processInstanceId = owner.processInstanceId)
    (positive : activation ≠ 0) :
    candidateWaitStart? program operation owner processInstanceId elementId activation =
      some
        { anchor := .wait
            { processInstanceId, elementId := ⟨elementId.value⟩, activation }
          processId
          elementId
          owner } := by
  simp [candidateWaitStart?, processIdForSelectedOperation?, exactOperationOwner?,
    candidateOccurrenceId, operationSelection, scopeSelection, scopeMatches,
    processSelection, ownerMatches, positive]

/-- Candidate User Task start from the exact wait created by the selected operation. -/
def candidateUserTaskStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (wait : UserTaskWait) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  if wait.owner ≠ owner then none
  else
    match operation with
    | .awaitUserTask _ _ _ output task =>
        if wait.task ≠ task || wait.output ≠ output || wait.metadata ≠ task.metadata then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId
            (⟨wait.task.id.value⟩ : NodeId) wait.activation
    | .awaitDataInputUserTask _ _ _ output taskId taskName _
    | .awaitDataInputOutputUserTask _ _ _ output taskId taskName _ _
    | .awaitDataOutputUserTask _ _ _ output taskId taskName _ =>
        if wait.task.id ≠ taskId || wait.task.name ≠ taskName || wait.output ≠ output ||
            wait.task.metadata.isSome || wait.metadata.isSome then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId
            (⟨wait.task.id.value⟩ : NodeId) wait.activation
    | .awaitBoundedUserTask _ _ _ task _ | .awaitMonitoredUserTask _ _ _ task _
    | .awaitMessageBoundedUserTask _ _ _ task _ | .awaitMessageMonitoredUserTask _ _ _ task _ =>
        if wait.task.id ≠ task.id || wait.task.name ≠ task.name || wait.output ≠ task.output ||
            wait.task.metadata.isSome || wait.metadata.isSome then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId
            (⟨wait.task.id.value⟩ : NodeId) wait.activation
    | .awaitSequentialMultiInstanceUserTask _ _ _ task _ normalOutput _ _ =>
        if wait.task.id ≠ task.id || wait.task.name ≠ task.name ||
            wait.output ≠ normalOutput || wait.task.metadata.isSome || wait.metadata.isSome then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId
            (⟨wait.task.id.value⟩ : NodeId) wait.activation
    | .awaitParallelMultiInstanceUserTask _ _ _ taskId taskName _ normalOutput _ _ _ =>
        if wait.task.id ≠ taskId || wait.task.name ≠ taskName ||
            wait.output ≠ normalOutput || wait.task.metadata.isSome || wait.metadata.isSome then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId
            (⟨wait.task.id.value⟩ : NodeId) wait.activation
    | _ => none

/-- Candidate Timer Catch start from the exact wait created by the selected operation. -/
def candidateTimerStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (wait : TimerWait) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  if wait.owner ≠ owner then none
  else
    match operation with
    | .awaitTimer _ _ _ output timer =>
        if wait.elementId ≠ timer.elementId || wait.output ≠ output then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId wait.elementId
            wait.activation
    | _ => none

/-- Candidate Message Catch or Receive Task start from the exact wait created by the selected operation. -/
def candidateMessageStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (wait : MessageWait) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  if wait.owner ≠ owner then none
  else
    match operation with
    | .awaitMessage _ _ _ output message =>
        if wait.elementId ≠ message.elementId || wait.channel ≠ message.channel ||
            wait.output ≠ output then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId wait.elementId
            wait.activation
    | .awaitPayloadMessage _ _ _ output message _ =>
        if wait.elementId ≠ message.elementId || wait.channel ≠ message.channel ||
            wait.output ≠ output then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId wait.elementId
            wait.activation
    | .awaitCorrelatedPayloadMessage _ _ _ output message _ _ _ _ =>
        if wait.elementId ≠ message.elementId || wait.channel ≠ message.channel ||
            wait.output ≠ output then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId wait.elementId
            wait.activation
    | _ => none

/-- The two Event-Based Gateway candidates come from its exact race and exact paired waits. -/
def candidateEventRaceStarts? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (race : EventRace) (messageWait : MessageWait)
    (timerWait : TimerWait) :
    Option (UnnumberedFlowNodeOccurrenceStart × UnnumberedFlowNodeOccurrenceStart) := do
  if race.owner ≠ owner || messageWait.owner ≠ owner || timerWait.owner ≠ owner then none
  else
    match operation with
    | .awaitEventRace _ origin _ message timer =>
        let messageId := candidateOccurrenceId messageWait.processInstanceId
          messageWait.elementId messageWait.activation
        let timerId := candidateOccurrenceId timerWait.processInstanceId
          timerWait.elementId timerWait.activation
        if race.id.elementId.value ≠ origin.elementId.value ||
            race.messageSubscriptionId ≠ messageId || race.timerOccurrenceId ≠ timerId ||
            messageWait.elementId ≠ message.elementId ||
            messageWait.channel ≠ message.channel || messageWait.output ≠ message.output ||
            timerWait.elementId ≠ timer.elementId || timerWait.output ≠ timer.output then none
        else
          pure
            (← candidateWaitStart? program operation owner messageWait.processInstanceId
                messageWait.elementId messageWait.activation,
              ← candidateWaitStart? program operation owner timerWait.processInstanceId
                timerWait.elementId timerWait.activation)
    | _ => none

/-- Candidate configured or Service Task start from the exact wait created by the selected operation. -/
def candidateEffectStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (wait : EffectWait) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  if wait.owner ≠ owner then none
  else
    match operation with
    | .awaitEffect _ _ _ output effect route =>
        if wait.elementId ≠ effect.elementId || wait.descriptor ≠ effect.descriptor ||
            !inputSnapshotMatchesUnder (programEffectMappingValuePolicy program) effect.inputMappings wait.arguments ||
            wait.outputMappings ≠ effect.outputMappings || wait.output ≠ output ||
            wait.bpmnErrorRoute ≠ route then none
        else
          candidateWaitStart? program operation owner wait.processInstanceId wait.elementId
            wait.activation
    | _ => none

/-- Candidate embedded Sub-Process start from the exact scope occurrence created by the selected operation. -/
def candidateScopeStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (occurrence : RuntimeScopeOccurrence) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  let processId ← processIdForSelectedOperation? program operation owner
  let origin ← match operation with
    | .enterScope _ origin _ _ childScopeId
    | .enterSequentialMultiInstanceScope _ origin _ _ childScopeId _ _ _ _ _
    | .enterParallelMultiInstanceScope _ origin _ _ childScopeId _ _ _ _ _
    | .enterBoundedScope _ origin _ _ childScopeId _
    | .enterMonitoredScope _ origin _ _ childScopeId _ =>
        if occurrence.parent ≠ some owner || occurrence.id.definitionScopeId ≠ childScopeId ||
            occurrence.id.processInstanceId ≠ owner.processInstanceId || occurrence.id.activation = 0
          then none
        else some origin
    | _ => none
  let definition ← definitionScope? program occurrence.id.definitionScopeId
  if definition.parentScopeId ≠ some owner.definitionScopeId ||
      definition.originElementId ≠ origin.elementId then none
  else
    pure
      { anchor := .scope occurrence.id
        processId
        elementId := origin.elementId
        owner }

/-- Candidate Call Activity start from the exact invocation record created by the selected operation. -/
def candidateCallStart? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (record : CalledProcessOccurrence) :
    Option UnnumberedFlowNodeOccurrenceStart := do
  let processId ← processIdForSelectedOperation? program operation owner
  match operation with
  | .invokeProcess _ origin _ calledProcessId calledRootScopeId _ returnOperationId _ =>
      if record.caller ≠ owner || record.id.processInstanceId ≠ owner.processInstanceId ||
          record.id.elementId.value ≠ origin.elementId.value || record.id.activation = 0 ||
          record.calledProcessId ≠ calledProcessId ||
          record.calledRoot.definitionScopeId ≠ calledRootScopeId ||
          record.returnOperationId ≠ returnOperationId then none
      else
        pure
          { anchor := .callActivity record.id
            processId
            elementId := origin.elementId
            owner }
  | _ => none

/-- SMIS-IDENTITY-01 selects the generated body through its unique outer Activity. -/
def sequentialScopeFlowNodeOwner? (state : RuntimeState) (elementId : NodeId) : Option ScopeOccurrenceId := do
  let [record] := state.activityOccurrences.filter (fun record => record.activityElementId == elementId) | none
  let .childScope child := record.body | none
  pure child

/-- FNOM-OCCURRENCE-01 counts each generated body; empty entry and final retirement start none. -/
def candidateSequentialScopeStarts? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (after : RuntimeState) : Option (List UnnumberedFlowNodeOccurrenceStart) := do
  let entry ← sequentialScopeEntry? operation
  match sequentialScopeBindingForEntry? entry after with
  | some binding =>
      if binding.activity.owner ≠ owner then none
      else pure [← candidateScopeStart? program operation owner binding.body]
  | none =>
      if after.scopeOccurrences.any (fun occurrence => occurrence.id.definitionScopeId == entry.childScopeId) ||
          after.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) ||
          after.sequentialScopeControllers.any (fun controller => controller.id.activityElementId.value == entry.elementId.value)
        then none
      else pure []

/-- PMIS-ENTER-01 publishes the exact captured population, including a genuinely empty collection. -/
def candidateParallelScopeStarts? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (before after : RuntimeState) : Option (List UnnumberedFlowNodeOccurrenceStart) := do
  let entry ← parallelScopeEntry? operation
  let _ ← processIdForSelectedOperation? program operation owner
  let definition ← definitionScope? program entry.childScopeId
  if definition.parentScopeId != some owner.definitionScopeId || definition.originElementId != entry.elementId then none else pure ()
  let [source] := before.variables.process.bindings.filter (·.name == entry.collectionName) | none
  let .stringList items := source.value | none
  let bodies := after.scopeOccurrences.filter (·.id.definitionScopeId == entry.childScopeId)
  let activities := after.activityOccurrences.filter (·.activityElementId == entry.elementId)
  let controllers := after.parallelScopeControllers.filter (fun controller =>
    controller.id.activityElementId.value == entry.elementId.value)
  if before.scopeOccurrences.any (fun scope => scope.id.definitionScopeId == entry.childScopeId) ||
      before.activityOccurrences.any (fun record => record.activityElementId == entry.elementId) ||
      before.parallelScopeControllers.any (fun row => row.id.activityElementId.value == entry.elementId.value) ||
      before.variables.scopes.any (fun frame => frame.owner.definitionScopeId == entry.childScopeId) then none
  else match items with
  | [] => if before.scopeOccurrences == after.scopeOccurrences &&
      before.activityOccurrences == after.activityOccurrences && before.parallelScopeControllers == after.parallelScopeControllers &&
      before.variables.scopes == after.variables.scopes && before.scopeActivations == after.scopeActivations &&
      before.activityActivations == after.activityActivations then some [] else none
  | _ :: _ => do
      let [activity] := activities | none
      let .parallelChildScopes first _ := activity.body | none
      let binding ← parallelScopeBinding? entry after first.scope
      let scopeBase := before.scopeActivations.filter (·.scopeId == entry.childScopeId)
      let activityBase := before.activityActivations.filter (fun row => row.taskId.value == entry.elementId.value)
      if scopeBase.length > 1 || activityBase.length > 1 ||
          !(scopeBase.all fun row => SemanticProcessJson.isSafeWireNat row.count) ||
          !(activityBase.all fun row => SemanticProcessJson.isSafeWireNat row.count) then none else pure ()
      let activityCount := activityActivationCount before ⟨entry.elementId.value⟩ + 1
      let scopeCount := scopeActivationCount before entry.childScopeId + items.length
      let [activityCounter] := after.activityActivations.filter (fun row => row.taskId.value == entry.elementId.value) | none
      let [scopeCounter] := after.scopeActivations.filter (·.scopeId == entry.childScopeId) | none
      if !SemanticProcessJson.isSafeWireNat activityCount || !SemanticProcessJson.isSafeWireNat scopeCount ||
          activityCounter.count != activityCount || scopeCounter.count != scopeCount ||
          (after.variables.scopes.filter fun frame => frame.owner.definitionScopeId == entry.childScopeId).length != items.length ||
          binding.activity.owner != owner || binding.activity != activity ||
          controllers != [binding.controller] || binding.controller.total != items.length ||
          binding.controller.completed != 0 || binding.iterations.length != bodies.length ||
          binding.iterations.map (·.item) != items ||
          binding.iterations.map (·.loopCounter) != List.range items.length ||
          activity.activation != activityActivationCount before ⟨entry.elementId.value⟩ + 1 ||
          binding.iterations.map (·.scope.activation) !=
            (List.range items.length).map (fun index => scopeActivationCount before entry.childScopeId + index + 1)
        then none
      else binding.iterations.mapM fun iteration => do
        let [body] := bodies.filter (·.id == iteration.scope) | none
        candidateScopeStart? program operation owner body

/-- SMIS-END-01 closes the selected old body before optionally starting its fresh successor. -/
def candidateSequentialScopeCompletionStarts? (program : Program) (operation : SemanticOperation)
    (owner : ScopeOccurrenceId) (before after : RuntimeState) : Option (List UnnumberedFlowNodeOccurrenceStart) := do
  let .completeSequentialMultiInstanceScope _ origin entryId := operation | none
  let binding ← sequentialScopeBindingForOwner? program before owner
  let [entryOperation] := program.operations.filter (fun candidate => candidate.id == entryId) | none
  if binding.entry.id ≠ entryId || binding.entry.elementId ≠ origin.elementId ||
      after.scopeOccurrences.any (fun occurrence => occurrence.id == owner) then none
  else candidateSequentialScopeStarts? program entryOperation binding.activity.owner after

end BpmnSemantics.SemanticProcess
