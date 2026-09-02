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

def insertCompensationHandlerEffectWait (wait : CompensationHandlerEffectWait)
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

/-- Reads the activation counter used to construct the next compensation effect identity. -/
def compensationEffectActivationCountIn (activations : List EffectActivation)
    (elementId : NodeId) : Nat :=
  match activations.find? fun activation => activation.elementId == elementId with
  | some activation => activation.count
  | none => 0

/-- Derives an effect's arguments from the handler input contract and its retained context. -/
def compensationHandlerArguments? (body : SingleEffectCompensationHandlerBody)
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

/-- Declarative activation of one maximal handler against the immutable pre-frontier trigger. -/
inductive CompensationHandlerActivationStep (program : Program)
    (trigger : CompensationTriggerExecution) :
    CompensationHandlerExecution → List EffectActivation →
      CompensationHandlerExecution → CompensationHandlerEffectWait →
      List EffectActivation → Prop where
  | activate (handler : CompensationHandlerExecution)
      (activations : List EffectActivation)
      (definition : CompensationSubjectDefinition)
      (restoredContext : Option CompensationParentContextSnapshot)
      (arguments : List VariableBinding) (activation : Nat)
      (maximal : compensationHandlerIsMaximal trigger handler = true)
      (declared : compensationSubjectDefinitionForOccurrence?
        program handler.identity.subject = some definition)
      (pending : handler.lifecycle = .pending restoredContext)
      (mapped : compensationHandlerArguments? definition.body restoredContext =
        some arguments)
      (fresh : activation = compensationEffectActivationCountIn activations
        definition.body.effectElementId + 1) :
      CompensationHandlerActivationStep program trigger handler activations
        { identity := handler.identity
          lifecycle := .compensating restoredContext
            { processInstanceId := trigger.id.processInstanceId
              elementId := ⟨definition.body.effectElementId.value⟩
              activation } }
        { id :=
            { processInstanceId := trigger.id.processInstanceId
              elementId := ⟨definition.body.effectElementId.value⟩
              activation }
          triggerId := trigger.id
          handlerId := handler.identity.id
          descriptor := definition.body.descriptor
          arguments }
        (setEffectActivationCount activations definition.body.effectElementId activation)

/-- Declarative maximal-frontier traversal; nonmaximal handlers are preserved exactly. -/
inductive CompensationFrontierHandlersStep (program : Program)
    (trigger : CompensationTriggerExecution) :
    List CompensationHandlerExecution → List EffectActivation →
      List CompensationHandlerExecution → List CompensationHandlerEffectWait →
      List EffectActivation → Prop where
  | nil (activations : List EffectActivation) :
      CompensationFrontierHandlersStep program trigger [] activations [] [] activations
  | activate (handler updated : CompensationHandlerExecution)
      (rest handlers : List CompensationHandlerExecution)
      (activations nextActivations finalActivations : List EffectActivation)
      (wait : CompensationHandlerEffectWait)
      (waits : List CompensationHandlerEffectWait)
      (head : CompensationHandlerActivationStep program trigger handler activations
        updated wait nextActivations)
      (tail : CompensationFrontierHandlersStep program trigger rest nextActivations
        handlers waits finalActivations) :
      CompensationFrontierHandlersStep program trigger (handler :: rest) activations
        (updated :: handlers) (insertCompensationHandlerEffectWait wait waits)
        finalActivations
  | preserve (handler : CompensationHandlerExecution)
      (rest handlers : List CompensationHandlerExecution)
      (activations finalActivations : List EffectActivation)
      (waits : List CompensationHandlerEffectWait)
      (notMaximal : compensationHandlerIsMaximal trigger handler = false)
      (tail : CompensationFrontierHandlersStep program trigger rest activations
        handlers waits finalActivations) :
      CompensationFrontierHandlersStep program trigger (handler :: rest) activations
        (handler :: handlers) waits finalActivations

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
        let arguments ← compensationHandlerArguments? definition.body restoredContext
        let activation := compensationEffectActivationCountIn activations
          definition.body.effectElementId + 1
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
        pure (updated :: handlers,
          insertCompensationHandlerEffectWait wait waits, finalActivations)
      else do
        let (handlers, waits, finalActivations) ←
          activateHandlers program trigger rest activations
        pure (handler :: handlers, waits, finalActivations)

private theorem activateHandlers_sound (program : Program)
    (trigger : CompensationTriggerExecution)
    (beforeHandlers afterHandlers : List CompensationHandlerExecution)
    (beforeActivations afterActivations : List EffectActivation)
    (waits : List CompensationHandlerEffectWait)
    (selected : activateHandlers program trigger beforeHandlers beforeActivations =
      some (afterHandlers, waits, afterActivations)) :
    CompensationFrontierHandlersStep program trigger beforeHandlers beforeActivations
      afterHandlers waits afterActivations := by
  induction beforeHandlers generalizing beforeActivations afterHandlers waits afterActivations with
  | nil =>
      simp [activateHandlers] at selected
      rcases selected with ⟨rfl, rfl, rfl⟩
      exact .nil beforeActivations
  | cons handler rest ih =>
      cases maximalEq : compensationHandlerIsMaximal trigger handler with
      | false =>
          cases tailEq : activateHandlers program trigger rest beforeActivations with
          | none => simp [activateHandlers, maximalEq, tailEq] at selected
          | some tailResult =>
              rcases tailResult with ⟨handlers, tailWaits, finalActivations⟩
              simp [activateHandlers, maximalEq, tailEq] at selected
              rcases selected with ⟨rfl, rfl, rfl⟩
              exact .preserve handler rest handlers beforeActivations finalActivations
                tailWaits maximalEq
                (ih handlers beforeActivations finalActivations tailWaits tailEq)
      | true =>
          cases declaredEq : compensationSubjectDefinitionForOccurrence?
              program handler.identity.subject with
          | none => simp [activateHandlers, maximalEq, declaredEq] at selected
          | some definition =>
              cases lifecycleEq : handler.lifecycle with
              | pending restoredContext =>
                  cases mappedEq : compensationHandlerArguments?
                      definition.body restoredContext with
                  | none =>
                      simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                        mappedEq] at selected
                  | some arguments =>
                      let activation := compensationEffectActivationCountIn beforeActivations
                        definition.body.effectElementId + 1
                      let nextActivations := setEffectActivationCount beforeActivations
                        definition.body.effectElementId activation
                      cases tailEq : activateHandlers program trigger rest nextActivations with
                      | none =>
                          simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                            mappedEq, activation, nextActivations, tailEq] at selected
                      | some tailResult =>
                          rcases tailResult with ⟨handlers, tailWaits, finalActivations⟩
                          simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                            mappedEq, activation, nextActivations, tailEq] at selected
                          rcases selected with ⟨rfl, rfl, rfl⟩
                          exact .activate handler
                            { identity := handler.identity
                              lifecycle := .compensating restoredContext
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation } }
                            rest handlers beforeActivations nextActivations finalActivations
                            { id :=
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation }
                              triggerId := trigger.id
                              handlerId := handler.identity.id
                              descriptor := definition.body.descriptor
                              arguments }
                            tailWaits
                            (.activate handler beforeActivations definition restoredContext
                              arguments activation maximalEq declaredEq lifecycleEq mappedEq rfl)
                            (ih handlers nextActivations finalActivations tailWaits tailEq)
              | compensating restoredContext effectId =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | compensated =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | failed =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | terminated =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected

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
  | activate (handlers : List CompensationHandlerExecution)
      (waits : List CompensationHandlerEffectWait)
      (effectActivations : List EffectActivation)
      (active : trigger.lifecycle = .active)
      (frontier : CompensationFrontierHandlersStep program trigger trigger.handlers
        state.effectActivations handlers waits effectActivations) :
      CompensationFrontierStep program state trigger
        { trigger := { trigger with handlers }, waits, effectActivations }

theorem activateCompensationFrontier_sound (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) (activation : CompensationFrontierActivation)
    (selected : activateCompensationFrontier program state trigger = some activation) :
    CompensationFrontierStep program state trigger activation := by
  cases activeEq : trigger.lifecycle != .active with
  | true => simp [activateCompensationFrontier, activeEq] at selected
  | false =>
      cases handlersEq : activateHandlers program trigger trigger.handlers
          state.effectActivations with
      | none => simp [activateCompensationFrontier, activeEq, handlersEq] at selected
      | some result =>
          rcases result with ⟨handlers, waits, effectActivations⟩
          simp [activateCompensationFrontier, activeEq, handlersEq] at selected
          cases selected
          exact .activate handlers waits effectActivations (by simpa using activeEq)
            (activateHandlers_sound program trigger trigger.handlers handlers
              state.effectActivations effectActivations waits handlersEq)

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

private def clearClaimedActivityRecords (owner : ScopeOccurrenceId) :
    List CompensationActivityRetention → List CompensationActivityRetention
  | [] => []
  | retention :: rest =>
      (if retention.owner = owner then { retention with records := [] } else retention) ::
        clearClaimedActivityRecords owner rest

def compensationTriggerHandlerStateValid (program : Program) (state : RuntimeState) : Bool :=
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
