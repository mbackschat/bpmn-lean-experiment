import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! # Compensation trigger construction and frontier activation -/

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

structure CompensationFrontierActivation where
  trigger : CompensationTriggerExecution
  waits : List CompensationHandlerEffectWait
  effectActivations : List EffectActivation
  deriving Repr, DecidableEq

private structure SelectedCompensationSubject where
  definition : CompensationSubjectDefinition
  occurrence : CompensationSubjectOccurrence
  restoredContext : Option CompensationParentContextSnapshot
  deriving Repr, DecidableEq

private def triggerRetentionOwnedByRoot (retention : CompensationParentContextRetention)
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

private def selectedCompensationSubjects? (program : Program)
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

private def nextOccurrence (instanceId : SemanticId) (elementId : String)
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

private def waitBefore
    (left right : CompensationHandlerEffectWait) : Bool :=
  compensationOccurrenceBefore left.id right.id

private def insertHandler (handler : CompensationHandlerExecution)
    (handlers : List CompensationHandlerExecution) : List CompensationHandlerExecution :=
  canonicalInsertBy handlerBefore handler handlers

private def insertTrigger (trigger : CompensationTriggerExecution)
    (triggers : List CompensationTriggerExecution) : List CompensationTriggerExecution :=
  canonicalInsertBy triggerBefore trigger triggers

private def insertWait (wait : CompensationHandlerEffectWait)
    (waits : List CompensationHandlerEffectWait) : List CompensationHandlerEffectWait :=
  canonicalInsertBy waitBefore wait waits

private def selectedHandlers (state : RuntimeState) (owner : ScopeOccurrenceId)
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

private def occurrenceDependencies (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (handlers : List CompensationHandlerExecution) : List CompensationOccurrenceDependency :=
  declaration.dependencies.filterMap fun dependency => do
    let predecessor ← handlerForDefinition? program handlers dependency.predecessorElementId
    let successor ← handlerForDefinition? program handlers dependency.successorElementId
    pure
      { predecessor := predecessor.identity.subject
        successor := successor.identity.subject
        reason := .sequenceFlow }

private def handlerHasUnfinishedSuccessor (trigger : CompensationTriggerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  trigger.dependencies.any fun dependency =>
    compensationSubjectMatches dependency.predecessor handler.identity.subject &&
      trigger.handlers.any fun candidate =>
        compensationSubjectMatches candidate.identity.subject dependency.successor &&
          match candidate.lifecycle with
          | .pending _ | .compensating _ _ => true
          | _ => false

/-- A frontier contains every pending subject with no unfinished forward successor. -/
def compensationHandlerIsMaximal (trigger : CompensationTriggerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  (match handler.lifecycle with | .pending _ => true | _ => false) &&
    !handlerHasUnfinishedSuccessor trigger handler

private def effectActivationCountIn (activations : List EffectActivation)
    (elementId : NodeId) : Nat :=
  match activations.find? fun activation => activation.elementId == elementId with
  | some activation => activation.count
  | none => 0

private def handlerArguments? (body : SingleEffectCompensationHandlerBody)
    (restoredContext : Option CompensationParentContextSnapshot) :
    Option (List VariableBinding) :=
  match body.input, restoredContext with
  | .empty, none => some []
  | .restoredProcessBinding sourceName argumentName, some snapshot =>
      match snapshot.frames with
      | processFrame :: _ =>
          match processFrame.bindings.filter fun binding => binding.name == sourceName with
          | [source] => some [{ name := argumentName, value := source.value }]
          | _ => none
      | _ => none
  | _, _ => none

private def activateHandlers (program : Program) (trigger : CompensationTriggerExecution) :
    List CompensationHandlerExecution → List EffectActivation →
      Option (List CompensationHandlerExecution ×
        List CompensationHandlerEffectWait × List EffectActivation)
  | [], activations => some ([], [], activations)
  | handler :: rest, activations => do
      if compensationHandlerIsMaximal trigger handler then
        let definition ← compensationSubjectDefinitionForOccurrence?
          program handler.identity.subject
        let restoredContext ← match handler.lifecycle with
          | .pending context => some context
          | _ => none
        let arguments ← handlerArguments? definition.body restoredContext
        let activation := effectActivationCountIn activations definition.body.effectElementId + 1
        let effectId : EffectOccurrenceId :=
          { processInstanceId := trigger.id.processInstanceId
            elementId := ⟨definition.body.effectElementId.value⟩
            activation }
        let nextActivations := setEffectActivationCount activations
          definition.body.effectElementId activation
        let (handlers, waits, finalActivations) ←
          activateHandlers program trigger rest nextActivations
        let updated : CompensationHandlerExecution :=
          { identity := handler.identity
            lifecycle := .compensating restoredContext effectId }
        let wait : CompensationHandlerEffectWait :=
          { id := effectId
            triggerId := trigger.id
            handlerId := handler.identity.id
            descriptor := definition.body.descriptor
            arguments }
        pure (updated :: handlers, insertWait wait waits, finalActivations)
      else do
        let (handlers, waits, finalActivations) ←
          activateHandlers program trigger rest activations
        pure (handler :: handlers, waits, finalActivations)

/-- Activates the complete maximal frontier against one immutable pre-frontier trigger. -/
def activateCompensationFrontier (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : Option CompensationFrontierActivation := do
  if trigger.lifecycle != .active then none
  else
    let (handlers, waits, effectActivations) ←
      activateHandlers program trigger trigger.handlers state.effectActivations
    pure { trigger := { trigger with handlers }, waits, effectActivations }

inductive CompensationFrontierStep (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : CompensationFrontierActivation → Prop where
  | activate (activation : CompensationFrontierActivation)
      (complete : activation.trigger.handlers.filter
          (compensationHandlerIsMaximal activation.trigger) = [])
      (selected : activateCompensationFrontier program state trigger = some activation) :
      CompensationFrontierStep program state trigger activation

private def compensationExecutionCapacityRefusal?
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

private def clearClaimedActivityRecords (owner : ScopeOccurrenceId) :
    List CompensationActivityRetention → List CompensationActivityRetention
  | [] => []
  | retention :: rest =>
      (if retention.owner = owner then { retention with records := [] } else retention) ::
        clearClaimedActivityRecords owner rest

private def completeTriggerStateValid (program : Program) (state : RuntimeState) : Bool :=
  compensationActivityRetentionStateValid program state &&
    compensationEventSubProcessSnapshotStateValid program state &&
    compensationExecutionStateValid program state

/-- Constructs every prospective record before consuming the throw token or eligible sources. -/
def attemptCompensationTrigger (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : CompensationTriggerAttempt :=
  match program.compensationExecution, operation with
  | some declaration,
      .triggerCompensation operationId _ definitionScopeId input output =>
      if declaration.triggerOperationId != operationId ||
          !compensationExecutionDeclarationValid program then
        .refused .invalidProgram
      else match state.control, onlyTokenOwner? state input with
        | .running _, some owner =>
            if owner.definitionScopeId != definitionScopeId ||
                (state.scopeOccurrences.filter fun occurrence =>
                  occurrence.id == owner && occurrence.parent.isNone).length != 1 then
              .disabled state
            else if !completeTriggerStateValid program state then
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
                  if completeTriggerStateValid program successor then .applied successor
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
                        insertWait wait current) state.compensationHandlerEffectWaits
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
                          if completeTriggerStateValid program successor then .applied successor
                          else .refused .invalidState
        | _, _ => .disabled state
  | _, _ => .refused .invalidProgram

inductive CompensationTriggerStep (program : Program) (operation : SemanticOperation)
    (before : RuntimeState) : RuntimeState → Prop where
  | applied (after : RuntimeState)
      (selected : attemptCompensationTrigger program operation before = .applied after) :
      CompensationTriggerStep program operation before after

inductive CompensationTriggerRefusalStep (program : Program)
    (operation : SemanticOperation) (before : RuntimeState) : CompensationTriggerRefusal → Prop where
  | refused (reason : CompensationTriggerRefusal)
      (selected : attemptCompensationTrigger program operation before = .refused reason) :
      CompensationTriggerRefusalStep program operation before reason

theorem attemptCompensationTrigger_sound (program : Program)
    (operation : SemanticOperation) (before after : RuntimeState)
    (selected : attemptCompensationTrigger program operation before = .applied after) :
    CompensationTriggerStep program operation before after :=
  .applied after selected

end BpmnSemantics.SemanticProcess
