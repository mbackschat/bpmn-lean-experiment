import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerFrontier

/-! # Compensation trigger construction -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

inductive CompensationTriggerCapacityMeasure where
  | triggers
  | handlers
  | canonicalBytes
  deriving Repr, DecidableEq

inductive CompensationTriggerRefusal where
  | invalidProgram
  | invalidState
  | activeTriggerExists
  | invalidSources
  | capacity (measure : CompensationTriggerCapacityMeasure) (bound prospective : Nat)
  deriving Repr, DecidableEq

inductive CompensationTriggerAttempt where
  | disabled (state : RuntimeState)
  | applied (state : RuntimeState)
  | refused (reason : CompensationTriggerRefusal)
  deriving Repr, DecidableEq

/-- One retained compensation source paired with its declaration and restoration context. -/
structure SelectedCompensationSubject where
  definition : CompensationSubjectDefinition
  occurrence : CompensationSubjectOccurrence
  restoredContext : Option CompensationParentContextSnapshot
  deriving Repr, DecidableEq

/-- Whether a retained parent context belongs to the triggering root or one of its children. -/
def triggerRetentionOwnedByRoot (retention : CompensationParentContextRetention)
    (owner : ScopeOccurrenceId) : Bool :=
  retention.parent.id == owner || retention.parent.parent == some owner

private def findUnique? (candidates : List α) : Option α :=
  match candidates with
  | [candidate] => some candidate
  | _ => none

private def boundaryDefinitionFor? (declaration : CompensationExecutionDeclaration)
    (activity : ActivityOccurrenceId) : Option CompensationSubjectDefinition :=
  findUnique? (declaration.subjects.filter fun definition =>
    match definition with
    | .boundaryActivity elementId _ => elementId.value == activity.activityElementId.value
    | _ => false)

private def eventDefinitionFor? (declaration : CompensationExecutionDeclaration)
    (parent : ScopeOccurrenceId) (handlerScopeId : DefinitionScopeId) :
    Option CompensationSubjectDefinition :=
  findUnique? (declaration.subjects.filter fun definition =>
    match definition with
    | .eventSubProcess parentScopeId candidateHandlerScopeId _ =>
        parentScopeId == parent.definitionScopeId && candidateHandlerScopeId == handlerScopeId
    | _ => false)

private def selectActivities (declaration : CompensationExecutionDeclaration) :
    List CompletedCompensableActivity → Option (List SelectedCompensationSubject)
  | [] => some []
  | record :: rest => do
      let definition ← boundaryDefinitionFor? declaration record.id
      let selected ← selectActivities declaration rest
      pure
        ({ definition
           occurrence := .boundaryActivity record.id
           restoredContext := none } :: selected)

private def selectContexts (declaration : CompensationExecutionDeclaration) :
    List CompensationParentContextRetention → Option (List SelectedCompensationSubject)
  | [] => some []
  | .provisional .. :: _ => none
  | .promoted parent handlerScopeId snapshot :: rest => do
      let definition ← eventDefinitionFor? declaration parent.id handlerScopeId
      let selected ← selectContexts declaration rest
      pure
        ({ definition
           occurrence := .eventSubProcess parent.id
           restoredContext := some snapshot } :: selected)

/-- Selects every eligible retained source exactly once for a triggering root. -/
def selectedCompensationSubjects? (program : Program)
    (owner : ScopeOccurrenceId) (state : RuntimeState) :
    Option (List SelectedCompensationSubject) := do
  let declaration ← program.compensationExecution
  let activityRecords ←
    match program.compensationActivityRetention,
        state.compensationActivityRetentions.filter fun retention => retention.owner == owner with
    | none, [] => some []
    | some _, [retention] => some retention.records
    | _, _ => none
  let activities ← selectActivities declaration activityRecords
  let contexts ← selectContexts declaration
    (state.compensationParentContextRetentions.filter fun retention =>
      triggerRetentionOwnedByRoot retention owner)
  pure (activities ++ contexts)

private def maximumOccurrenceActivation (elementId : String) : List OccurrenceId → Nat
  | [] => 0
  | id :: rest =>
      max (if id.elementId.value = elementId then id.activation else 0)
        (maximumOccurrenceActivation elementId rest)

/-- Allocates the next monotonic compensation occurrence identity for one element. -/
def nextOccurrence (instanceId : SemanticId) (elementId : String)
    (existing : List OccurrenceId) : OccurrenceId :=
  { processInstanceId := instanceId
    elementId := ⟨elementId⟩
    activation := maximumOccurrenceActivation elementId existing + 1 }

private def handlerBefore
    (left right : CompensationHandlerExecution) : Bool :=
  compensationOccurrenceBefore left.identity.id right.identity.id

private def triggerBefore
    (left right : CompensationTriggerExecution) : Bool :=
  compensationOccurrenceBefore left.id right.id

private def insertHandler (handler : CompensationHandlerExecution)
    (handlers : List CompensationHandlerExecution) : List CompensationHandlerExecution :=
  canonicalInsertBy handlerBefore handler handlers

/-- Inserts a trigger in canonical occurrence order. -/
def insertTrigger (trigger : CompensationTriggerExecution)
    (triggers : List CompensationTriggerExecution) : List CompensationTriggerExecution :=
  canonicalInsertBy triggerBefore trigger triggers

/-- Constructs pending handlers for the exact selected sources. -/
def selectedHandlers (state : RuntimeState) (owner : ScopeOccurrenceId)
    (selected : List SelectedCompensationSubject) : List CompensationHandlerExecution :=
  let existing := state.compensationTriggers.flatMap fun trigger =>
    trigger.handlers.map (·.identity.id)
  selected.foldl (fun handlers subject =>
    let body := subject.definition.body
    insertHandler
      { identity :=
          { id := nextOccurrence owner.processInstanceId body.handlerElementId.value existing
            subject := subject.occurrence
            handlerElementId := body.handlerElementId }
        lifecycle := .pending subject.restoredContext }
      handlers) []

private def handlerForDefinition? (program : Program)
    (handlers : List CompensationHandlerExecution) (elementId : NodeId) :
    Option CompensationHandlerExecution :=
  handlers.find? fun handler =>
    match handler.identity.subject with
    | .boundaryActivity activity => activity.activityElementId.value == elementId.value
    | .eventSubProcess parent =>
        (program.definitionScopes.find? fun scope => scope.id == parent.definitionScopeId).map
          (·.originElementId) == some elementId

/-- Lifts declaration dependencies to the selected occurrence identities. -/
def occurrenceDependencies (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (handlers : List CompensationHandlerExecution) : List CompensationOccurrenceDependency :=
  declaration.dependencies.filterMap fun dependency => do
    let predecessor ← handlerForDefinition? program handlers dependency.predecessorElementId
    let successor ← handlerForDefinition? program handlers dependency.successorElementId
    pure
      { predecessor := predecessor.identity.subject
        successor := successor.identity.subject
        reason := .sequenceFlow }

def compensationExecutionCapacityRefusal?
    (declaration : CompensationExecutionDeclaration)
    (triggers : List CompensationTriggerExecution)
    (waits : List CompensationHandlerEffectWait) : Option CompensationTriggerRefusal :=
  if triggers.length > declaration.limits.maxTriggers then
    some (.capacity .triggers declaration.limits.maxTriggers triggers.length)
  else
    let prospectiveHandlers := triggers.foldl (fun observed trigger =>
      max observed trigger.handlers.length) 0
    if prospectiveHandlers > declaration.limits.maxHandlers then
      some (.capacity .handlers declaration.limits.maxHandlers prospectiveHandlers)
    else
      let prospectiveBytes := canonicalCompensationExecutionStateUtf8Bytes triggers waits
      if prospectiveBytes > declaration.limits.maxCanonicalBytes then
        some (.capacity .canonicalBytes declaration.limits.maxCanonicalBytes prospectiveBytes)
      else none

/-- Clears only the activity records claimed by the triggering root. -/
def clearClaimedActivityRecords (owner : ScopeOccurrenceId) :
    List CompensationActivityRetention → List CompensationActivityRetention
  | [] => []
  | retention :: rest =>
      (if retention.owner = owner then { retention with records := [] } else retention) ::
        clearClaimedActivityRecords owner rest

def compensationTriggerHandlerStateValid (program : Program) (state : RuntimeState) : Bool :=
  compensationActivityRetentionStateValid program state &&
    compensationEventSubProcessSnapshotStateValid program state &&
    compensationExecutionStateValid program state

/-- Decides the declaration and operation-identity gate. -/
def compensationTriggerProgramRejected (program : Program)
    (declaration : CompensationExecutionDeclaration) (operationId : OperationId) : Bool :=
  declaration.triggerOperationId != operationId ||
    !compensationExecutionDeclarationValid program

/-- Decides whether the selected token owner is the unique matching root occurrence. -/
def compensationTriggerOwnerRejected (state : RuntimeState)
    (owner : ScopeOccurrenceId) (definitionScopeId : DefinitionScopeId) : Bool :=
  owner.definitionScopeId != definitionScopeId ||
    (state.scopeOccurrences.filter fun occurrence =>
      occurrence.id == owner && occurrence.parent.isNone).length != 1

/-- Constructs every prospective record before consuming the throw token or eligible sources. -/
def attemptCompensationTrigger (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : CompensationTriggerAttempt :=
  match program.compensationExecution, operation with
  | some declaration,
      .triggerCompensation operationId _ definitionScopeId input output =>
      if compensationTriggerProgramRejected program declaration operationId then
        .refused .invalidProgram
      else match state.control, onlyTokenOwner? state input with
        | .running _, some owner =>
            if compensationTriggerOwnerRejected state owner definitionScopeId then
              .disabled state
            else if !compensationTriggerHandlerStateValid program state then
              .refused .invalidState
            else if state.compensationTriggers.any fun trigger =>
                trigger.lifecycle == .active && trigger.owner == owner then
              .refused .activeTriggerExists
            else match selectedCompensationSubjects? program owner state with
              | none => .refused .invalidSources
              | some [] =>
                  let successor :=
                    { state with
                      tokens := addToken (removeToken state.tokens input owner) output owner }
                  if compensationTriggerHandlerStateValid program successor then .applied successor
                  else .refused .invalidState
              | some selected =>
                  let triggerId := nextOccurrence owner.processInstanceId operationId.value
                    (state.compensationTriggers.map (·.id))
                  let handlers := selectedHandlers state owner selected
                  let pending : CompensationTriggerExecution :=
                    { id := triggerId
                      owner
                      output
                      lifecycle := .active
                      handlers
                      dependencies := occurrenceDependencies program declaration handlers }
                  match activateCompensationFrontier program state pending with
                  | none => .refused .invalidSources
                  | some activated =>
                      let triggers := insertTrigger activated.trigger state.compensationTriggers
                      let waits := activated.waits.foldl (fun current wait =>
                        insertCompensationHandlerEffectWait wait current)
                        state.compensationHandlerEffectWaits
                      match compensationExecutionCapacityRefusal? declaration triggers waits with
                      | some reason => .refused reason
                      | none =>
                          let successor :=
                            { state with
                              tokens := removeToken state.tokens input owner
                              compensationActivityRetentions :=
                                clearClaimedActivityRecords owner
                                  state.compensationActivityRetentions
                              compensationParentContextRetentions :=
                                state.compensationParentContextRetentions.filter fun retention =>
                                  !triggerRetentionOwnedByRoot retention owner
                              compensationTriggers := triggers
                              compensationHandlerEffectWaits := waits
                              effectActivations := activated.effectActivations }
                          if compensationTriggerHandlerStateValid program successor then
                            .applied successor
                          else .refused .invalidState
        | _, _ => .disabled state
  | _, _ => .refused .invalidProgram

/-- The declared compensation operation and its program contract pass the trigger gate. -/
inductive CompensationTriggerProgramReady (program : Program)
    (operation : SemanticOperation) : CompensationExecutionDeclaration → OperationId →
      DefinitionScopeId → ControlPlaceId → ControlPlaceId → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (origin : BpmnElementOrigin)
      (definitionScopeId : DefinitionScopeId) (input output : ControlPlaceId)
      (declarationSelected : program.compensationExecution = some declaration)
      (operationSelected : operation = .triggerCompensation operationId origin
        definitionScopeId input output)
      (accepted : compensationTriggerProgramRejected program declaration operationId = false) :
      CompensationTriggerProgramReady program operation declaration operationId
        definitionScopeId input output

/-- A running root occurrence owns every token at the trigger input. -/
inductive CompensationTriggerOwnerReady (state : RuntimeState)
    (definitionScopeId : DefinitionScopeId) (input : ControlPlaceId) :
    ScopeOccurrenceId → Prop where
  | ready (instanceId : SemanticId) (owner : ScopeOccurrenceId)
      (running : state.control = .running instanceId)
      (ownerSelected : onlyTokenOwner? state input = some owner)
      (accepted : compensationTriggerOwnerRejected state owner definitionScopeId = false) :
      CompensationTriggerOwnerReady state definitionScopeId input owner

/-- The trigger has a valid source state and no competing active trigger for its owner. -/
inductive CompensationTriggerReady (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : CompensationExecutionDeclaration → OperationId →
      DefinitionScopeId → ControlPlaceId → ControlPlaceId → ScopeOccurrenceId → Prop where
  | ready (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (ownerReady : CompensationTriggerOwnerReady state definitionScopeId input owner)
      (stateAccepted : (!compensationTriggerHandlerStateValid program state) = false)
      (unclaimed : (state.compensationTriggers.any fun trigger =>
        trigger.lifecycle == .active && trigger.owner == owner) = false) :
      CompensationTriggerReady program operation state declaration operationId
        definitionScopeId input output owner

/-- Declarative successful compensation trigger transition. -/
inductive CompensationTriggerStep (program : Program) (operation : SemanticOperation)
    (before : RuntimeState) : RuntimeState → Prop where
  | zeroSubjects (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId) (after : RuntimeState)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some [])
      (afterShape : after =
        { before with
          tokens := addToken (removeToken before.tokens input owner) output owner })
      (afterValid : compensationTriggerHandlerStateValid program after = true) :
      CompensationTriggerStep program operation before after
  | nonempty (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (first : SelectedCompensationSubject) (rest : List SelectedCompensationSubject)
      (pending : CompensationTriggerExecution) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (after : RuntimeState)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some (first :: rest))
      (pendingShape : pending =
        { id := nextOccurrence owner.processInstanceId operationId.value
            (before.compensationTriggers.map (·.id))
          owner
          output
          lifecycle := .active
          handlers := selectedHandlers before owner (first :: rest)
          dependencies := occurrenceDependencies program declaration
            (selectedHandlers before owner (first :: rest)) })
      (frontier : CompensationFrontierStep program before pending activated)
      (triggersShape : triggers = insertTrigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current)
        before.compensationHandlerEffectWaits)
      (withinCapacity : compensationExecutionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { before with
          tokens := removeToken before.tokens input owner
          compensationActivityRetentions :=
            clearClaimedActivityRecords owner before.compensationActivityRetentions
          compensationParentContextRetentions :=
            before.compensationParentContextRetentions.filter fun retention =>
              !triggerRetentionOwnedByRoot retention owner
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (afterValid : compensationTriggerHandlerStateValid program after = true) :
      CompensationTriggerStep program operation before after

/-- Declarative disabled trigger: the pre-state is returned unchanged. -/
inductive CompensationTriggerDisabledStep (program : Program)
    (operation : SemanticOperation) (before : RuntimeState) : Prop where
  | nonrunning (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (unavailable : (match before.control with | .running _ => false | _ => true) = true) :
      CompensationTriggerDisabledStep program operation before
  | missingOwner (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (instanceId : SemanticId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (running : before.control = .running instanceId)
      (missing : onlyTokenOwner? before input = none) :
      CompensationTriggerDisabledStep program operation before
  | invalidOwner (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (instanceId : SemanticId)
      (owner : ScopeOccurrenceId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (running : before.control = .running instanceId)
      (ownerSelected : onlyTokenOwner? before input = some owner)
      (rejected : compensationTriggerOwnerRejected before owner definitionScopeId = true) :
      CompensationTriggerDisabledStep program operation before

/-- Declarative compensation trigger refusal before any mutation is committed. -/
inductive CompensationTriggerRefusalStep (program : Program)
    (operation : SemanticOperation) (before : RuntimeState) : CompensationTriggerRefusal → Prop where
  | invalidProgram
      (rejected : match program.compensationExecution, operation with
        | some declaration, .triggerCompensation operationId _ _ _ _ =>
            compensationTriggerProgramRejected program declaration operationId
        | _, _ => true) :
      CompensationTriggerRefusalStep program operation before .invalidProgram
  | invalidState (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (ownerReady : CompensationTriggerOwnerReady before definitionScopeId input owner)
      (rejected : (!compensationTriggerHandlerStateValid program before) = true) :
      CompensationTriggerRefusalStep program operation before .invalidState
  | activeTrigger (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (programReady : CompensationTriggerProgramReady program operation declaration
        operationId definitionScopeId input output)
      (ownerReady : CompensationTriggerOwnerReady before definitionScopeId input owner)
      (stateAccepted : (!compensationTriggerHandlerStateValid program before) = false)
      (claimed : (before.compensationTriggers.any fun trigger =>
        trigger.lifecycle == .active && trigger.owner == owner) = true) :
      CompensationTriggerRefusalStep program operation before .activeTriggerExists
  | invalidSources (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (absent : selectedCompensationSubjects? program owner before = none) :
      CompensationTriggerRefusalStep program operation before .invalidSources
  | invalidFrontier (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (first : SelectedCompensationSubject) (rest : List SelectedCompensationSubject)
      (pending : CompensationTriggerExecution)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some (first :: rest))
      (pendingShape : pending =
        { id := nextOccurrence owner.processInstanceId operationId.value
            (before.compensationTriggers.map (·.id))
          owner
          output
          lifecycle := .active
          handlers := selectedHandlers before owner (first :: rest)
          dependencies := occurrenceDependencies program declaration
            (selectedHandlers before owner (first :: rest)) })
      (frontier : CompensationFrontierRefusalStep program before pending) :
      CompensationTriggerRefusalStep program operation before .invalidSources
  | capacity (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (first : SelectedCompensationSubject) (rest : List SelectedCompensationSubject)
      (pending : CompensationTriggerExecution) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (reason : CompensationTriggerRefusal)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some (first :: rest))
      (pendingShape : pending =
        { id := nextOccurrence owner.processInstanceId operationId.value
            (before.compensationTriggers.map (·.id))
          owner
          output
          lifecycle := .active
          handlers := selectedHandlers before owner (first :: rest)
          dependencies := occurrenceDependencies program declaration
            (selectedHandlers before owner (first :: rest)) })
      (frontier : CompensationFrontierStep program before pending activated)
      (triggersShape : triggers = insertTrigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current)
        before.compensationHandlerEffectWaits)
      (exceeded : compensationExecutionCapacityRefusal? declaration triggers waits = some reason) :
      CompensationTriggerRefusalStep program operation before reason
  | invalidZeroSubjectSuccessor (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId) (after : RuntimeState)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some [])
      (afterShape : after =
        { before with
          tokens := addToken (removeToken before.tokens input owner) output owner })
      (rejected : compensationTriggerHandlerStateValid program after = false) :
      CompensationTriggerRefusalStep program operation before .invalidState
  | invalidNonemptySuccessor (declaration : CompensationExecutionDeclaration)
      (operationId : OperationId) (definitionScopeId : DefinitionScopeId)
      (input output : ControlPlaceId) (owner : ScopeOccurrenceId)
      (first : SelectedCompensationSubject) (rest : List SelectedCompensationSubject)
      (pending : CompensationTriggerExecution) (activated : CompensationFrontierActivation)
      (triggers : List CompensationTriggerExecution)
      (waits : List CompensationHandlerEffectWait) (after : RuntimeState)
      (ready : CompensationTriggerReady program operation before declaration operationId
        definitionScopeId input output owner)
      (sources : selectedCompensationSubjects? program owner before = some (first :: rest))
      (pendingShape : pending =
        { id := nextOccurrence owner.processInstanceId operationId.value
            (before.compensationTriggers.map (·.id))
          owner
          output
          lifecycle := .active
          handlers := selectedHandlers before owner (first :: rest)
          dependencies := occurrenceDependencies program declaration
            (selectedHandlers before owner (first :: rest)) })
      (frontier : CompensationFrontierStep program before pending activated)
      (triggersShape : triggers = insertTrigger activated.trigger before.compensationTriggers)
      (waitsShape : waits = activated.waits.foldl (fun current wait =>
        insertCompensationHandlerEffectWait wait current)
        before.compensationHandlerEffectWaits)
      (withinCapacity : compensationExecutionCapacityRefusal? declaration triggers waits = none)
      (afterShape : after =
        { before with
          tokens := removeToken before.tokens input owner
          compensationActivityRetentions :=
            clearClaimedActivityRecords owner before.compensationActivityRetentions
          compensationParentContextRetentions :=
            before.compensationParentContextRetentions.filter fun retention =>
              !triggerRetentionOwnedByRoot retention owner
          compensationTriggers := triggers
          compensationHandlerEffectWaits := waits
          effectActivations := activated.effectActivations })
      (rejected : compensationTriggerHandlerStateValid program after = false) :
      CompensationTriggerRefusalStep program operation before .invalidState

theorem attemptCompensationTrigger_sound (program : Program)
    (operation : SemanticOperation) (before after : RuntimeState)
    (selected : attemptCompensationTrigger program operation before = .applied after) :
    CompensationTriggerStep program operation before after := by
  cases declarationEq : program.compensationExecution with
  | none => simp [attemptCompensationTrigger, declarationEq] at selected
  | some declaration =>
      cases operation <;>
        simp only [attemptCompensationTrigger, declarationEq] at selected
      all_goals try { cases selected }
      case triggerCompensation operationId origin definitionScopeId input output =>
        cases programRejectedEq :
            compensationTriggerProgramRejected program declaration operationId with
        | true => simp [programRejectedEq] at selected
        | false =>
            cases controlEq : before.control <;>
              simp only [programRejectedEq, controlEq] at selected
            all_goals try { cases selected }
            case running instanceId =>
              simp only [Bool.false_eq_true, if_false] at selected
              cases ownerEq : onlyTokenOwner? before input with
              | none => simp [ownerEq] at selected
              | some owner =>
                  cases ownerRejectedEq :
                      compensationTriggerOwnerRejected before owner definitionScopeId with
                  | true => simp [ownerEq, ownerRejectedEq] at selected
                  | false =>
                      cases stateRejectedEq :
                          !compensationTriggerHandlerStateValid program before with
                      | true =>
                          simp [ownerEq, ownerRejectedEq, stateRejectedEq] at selected
                      | false =>
                          cases activeEq : (before.compensationTriggers.any fun trigger =>
                              trigger.lifecycle == .active && trigger.owner == owner) with
                          | true =>
                              simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq]
                                at selected
                          | false =>
                              let programReady : CompensationTriggerProgramReady program
                                  (.triggerCompensation operationId origin definitionScopeId
                                    input output)
                                  declaration operationId definitionScopeId input output :=
                                .ready declaration operationId origin definitionScopeId input
                                  output declarationEq rfl programRejectedEq
                              let ownerReady : CompensationTriggerOwnerReady before
                                  definitionScopeId input owner :=
                                .ready instanceId owner controlEq ownerEq ownerRejectedEq
                              let ready : CompensationTriggerReady program
                                  (.triggerCompensation operationId origin definitionScopeId
                                    input output)
                                  before declaration operationId definitionScopeId input output
                                  owner :=
                                .ready declaration operationId definitionScopeId input output
                                  owner programReady ownerReady stateRejectedEq activeEq
                              cases sourcesEq : selectedCompensationSubjects? program owner before with
                              | none =>
                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                    sourcesEq] at selected
                              | some selectedSubjects =>
                                  cases selectedSubjects with
                                  | nil =>
                                      let successor : RuntimeState :=
                                        { before with
                                          tokens := addToken
                                            (removeToken before.tokens input owner) output owner }
                                      cases validEq :
                                          compensationTriggerHandlerStateValid program successor with
                                      | false =>
                                          have evaluatorValidEq :
                                              compensationTriggerHandlerStateValid program
                                                { before with
                                                  control := .running instanceId
                                                  tokens := addToken
                                                    (removeToken before.tokens input owner)
                                                    output owner } = false := by
                                            simpa [successor, controlEq] using validEq
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, evaluatorValidEq] at selected
                                      | true =>
                                          have evaluatorValidEq :
                                              compensationTriggerHandlerStateValid program
                                                { before with
                                                  control := .running instanceId
                                                  tokens := addToken
                                                    (removeToken before.tokens input owner)
                                                    output owner } = true := by
                                            simpa [successor, controlEq] using validEq
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, evaluatorValidEq] at selected
                                          cases selected
                                          exact .zeroSubjects declaration operationId
                                            definitionScopeId input output owner _ ready
                                            sourcesEq (by simp [controlEq]) evaluatorValidEq
                                  | cons first rest =>
                                      let pending : CompensationTriggerExecution :=
                                        { id := nextOccurrence owner.processInstanceId
                                            operationId.value
                                            (before.compensationTriggers.map (·.id))
                                          owner
                                          output
                                          lifecycle := .active
                                          handlers := selectedHandlers before owner (first :: rest)
                                          dependencies := occurrenceDependencies program declaration
                                            (selectedHandlers before owner (first :: rest)) }
                                      cases frontierEq :
                                          activateCompensationFrontier program before pending with
                                      | none =>
                                          simp [ownerEq, ownerRejectedEq, stateRejectedEq, activeEq,
                                            sourcesEq, pending, frontierEq] at selected
                                      | some activated =>
                                          let triggers :=
                                            insertTrigger activated.trigger
                                              before.compensationTriggers
                                          let waits := activated.waits.foldl (fun current wait =>
                                            insertCompensationHandlerEffectWait wait current)
                                            before.compensationHandlerEffectWaits
                                          cases capacityEq :
                                              compensationExecutionCapacityRefusal?
                                                declaration triggers waits with
                                          | some reason =>
                                              simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                activeEq, sourcesEq, pending, frontierEq, triggers,
                                                waits, capacityEq] at selected
                                          | none =>
                                              let successor : RuntimeState :=
                                                { before with
                                                  tokens := removeToken before.tokens input owner
                                                  compensationActivityRetentions :=
                                                    clearClaimedActivityRecords owner
                                                      before.compensationActivityRetentions
                                                  compensationParentContextRetentions :=
                                                    before.compensationParentContextRetentions.filter
                                                      fun retention =>
                                                        !triggerRetentionOwnedByRoot retention owner
                                                  compensationTriggers := triggers
                                                  compensationHandlerEffectWaits := waits
                                                  effectActivations := activated.effectActivations }
                                              cases validEq :
                                                  compensationTriggerHandlerStateValid program
                                                    successor with
                                              | false =>
                                                  have evaluatorValidEq :
                                                      compensationTriggerHandlerStateValid program
                                                        { before with
                                                          control := .running instanceId
                                                          tokens := removeToken before.tokens input
                                                            owner
                                                          compensationActivityRetentions :=
                                                            clearClaimedActivityRecords owner
                                                              before.compensationActivityRetentions
                                                          compensationParentContextRetentions :=
                                                            before.compensationParentContextRetentions.filter
                                                              fun retention =>
                                                                !triggerRetentionOwnedByRoot retention owner
                                                          compensationTriggers := triggers
                                                          compensationHandlerEffectWaits := waits
                                                          effectActivations :=
                                                            activated.effectActivations } = false := by
                                                    simpa [successor, controlEq] using validEq
                                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                    activeEq, sourcesEq, pending, frontierEq,
                                                    triggers, waits, capacityEq, evaluatorValidEq]
                                                    at selected
                                              | true =>
                                                  have evaluatorValidEq :
                                                      compensationTriggerHandlerStateValid program
                                                        { before with
                                                          control := .running instanceId
                                                          tokens := removeToken before.tokens input
                                                            owner
                                                          compensationActivityRetentions :=
                                                            clearClaimedActivityRecords owner
                                                              before.compensationActivityRetentions
                                                          compensationParentContextRetentions :=
                                                            before.compensationParentContextRetentions.filter
                                                              fun retention =>
                                                                !triggerRetentionOwnedByRoot retention owner
                                                          compensationTriggers := triggers
                                                          compensationHandlerEffectWaits := waits
                                                          effectActivations :=
                                                            activated.effectActivations } = true := by
                                                    simpa [successor, controlEq] using validEq
                                                  simp [ownerEq, ownerRejectedEq, stateRejectedEq,
                                                    activeEq, sourcesEq, pending, frontierEq,
                                                    triggers, waits, capacityEq, evaluatorValidEq]
                                                    at selected
                                                  cases selected
                                                  exact .nonempty declaration operationId
                                                    definitionScopeId input output owner first rest
                                                    pending activated triggers waits _ ready
                                                    sourcesEq rfl
                                                    (activateCompensationFrontier_sound program before
                                                      pending activated frontierEq)
                                                    rfl rfl capacityEq
                                                    (by simp [controlEq, triggers, waits])
                                                    evaluatorValidEq

end BpmnSemantics.SemanticProcess
