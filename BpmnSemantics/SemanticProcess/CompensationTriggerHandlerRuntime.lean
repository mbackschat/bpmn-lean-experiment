import BpmnSemantics.SemanticProcess.CompensationActivityRetention
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerDeclaration

/-! # Compensation trigger and handler runtime validity -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

private def canonicalArrayUtf8Bytes (measure : α → Nat) : List α → Nat
  | [] => 2
  | first :: rest =>
      rest.foldl (fun total value => total + measure value + 1) (measure first) + 2

def canonicalOccurrenceIdUtf8Bytes (id : OccurrenceId) : Nat :=
  "{\"activation\":".utf8ByteSize + (toString id.activation).utf8ByteSize +
    ",\"elementId\":".utf8ByteSize + canonicalJsonStringUtf8Bytes id.elementId.value +
    ",\"processInstanceId\":".utf8ByteSize +
      canonicalJsonStringUtf8Bytes id.processInstanceId.value +
    "}".utf8ByteSize

private def canonicalCompensationSubjectUtf8Bytes : CompensationSubjectOccurrence → Nat
  | .boundaryActivity activity =>
      "{\"activity\":".utf8ByteSize + canonicalActivityOccurrenceIdUtf8Bytes activity +
        ",\"kind\":\"boundaryActivity\"}".utf8ByteSize
  | .eventSubProcess parent =>
      "{\"kind\":\"eventSubProcess\",\"parent\":".utf8ByteSize +
        canonicalScopeOccurrenceIdUtf8Bytes parent + "}".utf8ByteSize

private def canonicalOptionalSnapshotUtf8Bytes :
    Option CompensationParentContextSnapshot → Nat
  | none => "null".utf8ByteSize
  | some snapshot => canonicalCompensationParentContextSnapshotUtf8Bytes snapshot

private def canonicalCompensationHandlerUtf8Bytes
    (handler : CompensationHandlerExecution) : Nat :=
  let identity := handler.identity
  match handler.lifecycle with
  | .pending restoredContext =>
      "{\"handlerElementId\":".utf8ByteSize +
          canonicalJsonStringUtf8Bytes identity.handlerElementId.value +
        ",\"id\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes identity.id +
        ",\"lifecycle\":\"pending\",\"restoredContext\":".utf8ByteSize +
          canonicalOptionalSnapshotUtf8Bytes restoredContext +
        ",\"subject\":".utf8ByteSize +
          canonicalCompensationSubjectUtf8Bytes identity.subject +
        "}".utf8ByteSize
  | .compensating restoredContext effectId =>
      "{\"effectId\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes effectId +
        ",\"handlerElementId\":".utf8ByteSize +
          canonicalJsonStringUtf8Bytes identity.handlerElementId.value +
        ",\"id\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes identity.id +
        ",\"lifecycle\":\"compensating\",\"restoredContext\":".utf8ByteSize +
          canonicalOptionalSnapshotUtf8Bytes restoredContext +
        ",\"subject\":".utf8ByteSize +
          canonicalCompensationSubjectUtf8Bytes identity.subject +
        "}".utf8ByteSize
  | .compensated => canonicalTerminalHandlerUtf8Bytes identity "compensated"
  | .failed => canonicalTerminalHandlerUtf8Bytes identity "failed"
  | .terminated => canonicalTerminalHandlerUtf8Bytes identity "terminated"
where
  canonicalTerminalHandlerUtf8Bytes
      (identity : CompensationHandlerIdentity) (lifecycle : String) : Nat :=
    "{\"handlerElementId\":".utf8ByteSize +
        canonicalJsonStringUtf8Bytes identity.handlerElementId.value +
      ",\"id\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes identity.id +
      ",\"lifecycle\":".utf8ByteSize + canonicalJsonStringUtf8Bytes lifecycle +
      ",\"subject\":".utf8ByteSize +
        canonicalCompensationSubjectUtf8Bytes identity.subject +
      "}".utf8ByteSize

private def canonicalCompensationDependencyUtf8Bytes
    (dependency : CompensationOccurrenceDependency) : Nat :=
  "{\"predecessor\":".utf8ByteSize +
      canonicalCompensationSubjectUtf8Bytes dependency.predecessor +
    ",\"reason\":\"sequenceFlow\",\"successor\":".utf8ByteSize +
      canonicalCompensationSubjectUtf8Bytes dependency.successor +
    "}".utf8ByteSize

private def canonicalCompensationTriggerUtf8Bytes
    (trigger : CompensationTriggerExecution) : Nat :=
  let lifecycle := match trigger.lifecycle with
    | .active => "active"
    | .succeeded => "succeeded"
    | .failed => "failed"
  "{\"dependencies\":".utf8ByteSize +
      canonicalArrayUtf8Bytes canonicalCompensationDependencyUtf8Bytes trigger.dependencies +
    ",\"handlers\":".utf8ByteSize +
      canonicalArrayUtf8Bytes canonicalCompensationHandlerUtf8Bytes trigger.handlers +
    ",\"id\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes trigger.id +
    ",\"lifecycle\":".utf8ByteSize + canonicalJsonStringUtf8Bytes lifecycle +
    ",\"output\":".utf8ByteSize + canonicalJsonStringUtf8Bytes trigger.output.value +
    ",\"owner\":".utf8ByteSize + canonicalScopeOccurrenceIdUtf8Bytes trigger.owner +
    "}".utf8ByteSize

private def canonicalEffectDescriptorUtf8Bytes (descriptor : EffectDescriptor) : Nat :=
  "{\"operation\":".utf8ByteSize + canonicalJsonStringUtf8Bytes descriptor.operation +
    ",\"protocol\":".utf8ByteSize + canonicalJsonStringUtf8Bytes descriptor.protocol +
    "}".utf8ByteSize

private def canonicalCompensationHandlerWaitUtf8Bytes
    (wait : CompensationHandlerEffectWait) : Nat :=
  "{\"arguments\":".utf8ByteSize +
      canonicalVariableBindingsUtf8Bytes wait.arguments +
    ",\"descriptor\":".utf8ByteSize +
      canonicalEffectDescriptorUtf8Bytes wait.descriptor +
    ",\"handlerId\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes wait.handlerId +
    ",\"id\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes wait.id +
    ",\"triggerId\":".utf8ByteSize + canonicalOccurrenceIdUtf8Bytes wait.triggerId +
    "}".utf8ByteSize

/-- Exact canonical bytes of the ordered `(triggers, handler waits)` pair used by both capacity checks. -/
def canonicalCompensationExecutionStateUtf8Bytes
    (triggers : List CompensationTriggerExecution)
    (waits : List CompensationHandlerEffectWait) : Nat :=
  canonicalArrayUtf8Bytes canonicalCompensationTriggerUtf8Bytes triggers +
    canonicalArrayUtf8Bytes canonicalCompensationHandlerWaitUtf8Bytes waits + 3

def compensationOccurrenceBefore (left right : OccurrenceId) : Bool :=
  if left.processInstanceId = right.processInstanceId then
    if left.elementId = right.elementId then left.activation < right.activation
    else decide (left.elementId.value < right.elementId.value)
  else decide (left.processInstanceId.value < right.processInstanceId.value)

private def strictlyOrdered (before : α → α → Bool) : List α → Bool
  | [] | [_] => true
  | left :: right :: rest => before left right && strictlyOrdered before (right :: rest)

private def occurrenceIdValid (id : OccurrenceId) : Bool :=
  !id.processInstanceId.value.isEmpty && !id.elementId.value.isEmpty &&
    id.activation > 0 && safeNat id.activation

private def activityOccurrenceIdValid (id : ActivityOccurrenceId) : Bool :=
  !id.processInstanceId.value.isEmpty && !id.activityElementId.value.isEmpty &&
    id.activation > 0 && safeNat id.activation

private def scopeOccurrenceIdValid (id : ScopeOccurrenceId) : Bool :=
  !id.processInstanceId.value.isEmpty && !id.definitionScopeId.value.isEmpty &&
    id.activation > 0 && safeNat id.activation

def compensationSubjectMatches (left right : CompensationSubjectOccurrence) : Bool :=
  match left, right with
  | .boundaryActivity left, .boundaryActivity right => left == right
  | .eventSubProcess left, .eventSubProcess right => left == right
  | _, _ => false

private def compensationSubjectValid : CompensationSubjectOccurrence → Bool
  | .boundaryActivity activity => activityOccurrenceIdValid activity
  | .eventSubProcess parent => scopeOccurrenceIdValid parent

def compensationSubjectDefinitionForOccurrence? (program : Program)
    (occurrence : CompensationSubjectOccurrence) : Option CompensationSubjectDefinition := do
  let declaration ← program.compensationExecution
  match declaration.subjects.filter fun subject =>
      match subject, occurrence with
      | .boundaryActivity elementId _, .boundaryActivity activity =>
          elementId.value == activity.activityElementId.value
      | .eventSubProcess parentScopeId _ _, .eventSubProcess parent =>
          parentScopeId == parent.definitionScopeId
      | _, _ => false with
  | [subject] => some subject
  | _ => none

def CompensationSubjectDefinition.body :
    CompensationSubjectDefinition → SingleEffectCompensationHandlerBody
  | .boundaryActivity _ body | .eventSubProcess _ _ body => body

private def occurrenceDefinitionId? (program : Program) :
    CompensationSubjectOccurrence → Option NodeId
  | .boundaryActivity activity => some ⟨activity.activityElementId.value⟩
  | .eventSubProcess parent =>
      (program.definitionScopes.find? fun scope =>
        scope.id == parent.definitionScopeId).map (·.originElementId)

private def handlersForDefinition (program : Program)
    (handlers : List CompensationHandlerExecution) (elementId : NodeId) :
    List CompensationHandlerExecution :=
  handlers.filter fun handler =>
    occurrenceDefinitionId? program handler.identity.subject = some elementId

/-- COMPH-TRIGGER-01 forbids ambiguous endpoints even when the opposite endpoint is absent. -/
def compensationDependenciesUnambiguous (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (handlers : List CompensationHandlerExecution) : Bool :=
  declaration.dependencies.all fun dependency =>
    (handlersForDefinition program handlers dependency.predecessorElementId).length ≤ 1 &&
      (handlersForDefinition program handlers dependency.successorElementId).length ≤ 1

/-- Only singleton endpoint pairs lift to exact occurrence edges; missing endpoints add no edge. -/
def expectedCompensationDependencies (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (handlers : List CompensationHandlerExecution) :
    List CompensationOccurrenceDependency :=
  declaration.dependencies.filterMap fun dependency =>
    match handlersForDefinition program handlers dependency.predecessorElementId,
        handlersForDefinition program handlers dependency.successorElementId with
    | [predecessor], [successor] => some
        { predecessor := predecessor.identity.subject
          successor := successor.identity.subject
          reason := .sequenceFlow }
    | _, _ => none

private def restoredContextMatchesInput (body : SingleEffectCompensationHandlerBody)
    (triggerOwner : ScopeOccurrenceId) (subject : CompensationSubjectOccurrence)
    (restoredContext : Option CompensationParentContextSnapshot) : Bool :=
  match body.input, subject, restoredContext with
  | .empty, .boundaryActivity _, none => true
  | .restoredProcessBinding sourceName _, .eventSubProcess parent,
      some { frames := [processFrame, parentFrame] } =>
      processFrame.owner == triggerOwner && parentFrame.owner == parent &&
        compensationParentContextBindingsValid processFrame.bindings &&
        compensationParentContextBindingsValid parentFrame.bindings &&
        parentFrame.bindings.isEmpty &&
        (processFrame.bindings.filter fun binding => binding.name == sourceName).length = 1
  | _, _, _ => false

private def handlerMatchesDeclaration (program : Program) (triggerOwner : ScopeOccurrenceId)
    (handler : CompensationHandlerExecution) : Bool :=
  match compensationSubjectDefinitionForOccurrence? program handler.identity.subject with
  | none => false
  | some definition =>
      let body := definition.body
      occurrenceIdValid handler.identity.id &&
        compensationSubjectValid handler.identity.subject &&
        handler.identity.id.processInstanceId == triggerOwner.processInstanceId &&
        handler.identity.id.elementId.value == handler.identity.handlerElementId.value &&
        handler.identity.handlerElementId == body.handlerElementId &&
        match handler.lifecycle with
        | .pending restoredContext | .compensating restoredContext _ =>
            restoredContextMatchesInput body triggerOwner handler.identity.subject restoredContext
        | .compensated | .failed | .terminated => true

private def handlerIdentityBefore
    (left right : CompensationHandlerExecution) : Bool :=
  compensationOccurrenceBefore left.identity.id right.identity.id

private def handlerIdentityUnique (handlers : List CompensationHandlerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  (handlers.filter fun candidate => candidate.identity.id == handler.identity.id).length = 1

private def handlerSubjectUnique (handlers : List CompensationHandlerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  (handlers.filter fun candidate =>
    compensationSubjectMatches candidate.identity.subject handler.identity.subject).length = 1

private def triggerLifecycleValid (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : Bool :=
  match trigger.lifecycle with
  | .active =>
      (match state.control with
        | .running instanceId => trigger.owner.processInstanceId == instanceId
        | _ => false) &&
        (state.scopeOccurrences.filter fun occurrence =>
          occurrence.id == trigger.owner && occurrence.parent.isNone).length = 1 &&
        (trigger.handlers.any fun handler =>
          match handler.lifecycle with | .pending _ | .compensating _ _ => true | _ => false) &&
        (trigger.handlers.all fun handler =>
          match handler.lifecycle with | .failed | .terminated => false | _ => true)
  | .succeeded => trigger.handlers.all fun handler => handler.lifecycle == .compensated
  | .failed =>
      (match state.control with | .failed .. => true | _ => false) &&
        (trigger.handlers.filter fun handler => handler.lifecycle == .failed).length = 1 &&
        (trigger.handlers.all fun handler =>
          handler.lifecycle == .compensated || handler.lifecycle == .failed ||
            handler.lifecycle == .terminated)

private def triggerMatchesDeclaration (program : Program) (state : RuntimeState)
    (declaration : CompensationExecutionDeclaration)
    (trigger : CompensationTriggerExecution) : Bool :=
  match program.operations.filter fun operation => operation.id == declaration.triggerOperationId with
  | [.triggerCompensation _ _ _ _ output] =>
      occurrenceIdValid trigger.id && scopeOccurrenceIdValid trigger.owner &&
        !trigger.handlers.isEmpty &&
        trigger.id.elementId.value == declaration.triggerOperationId.value &&
        trigger.id.processInstanceId == trigger.owner.processInstanceId &&
        trigger.owner.definitionScopeId == declaration.definitionScopeId &&
        trigger.output == output &&
        strictlyOrdered handlerIdentityBefore trigger.handlers &&
        trigger.handlers.all (handlerIdentityUnique trigger.handlers) &&
        trigger.handlers.all (handlerSubjectUnique trigger.handlers) &&
        trigger.handlers.all (handlerMatchesDeclaration program trigger.owner) &&
        compensationDependenciesUnambiguous program declaration trigger.handlers &&
        trigger.dependencies == expectedCompensationDependencies program declaration trigger.handlers &&
        triggerLifecycleValid state trigger
  | _ => false

private def triggerIdentityBefore
    (left right : CompensationTriggerExecution) : Bool :=
  compensationOccurrenceBefore left.id right.id

private def triggerIdentityUnique (triggers : List CompensationTriggerExecution)
    (trigger : CompensationTriggerExecution) : Bool :=
  (triggers.filter fun candidate => candidate.id == trigger.id).length = 1

private def handlerArgumentsMatch (body : SingleEffectCompensationHandlerBody)
    (trigger : CompensationTriggerExecution) (handler : CompensationHandlerExecution)
    (arguments : List VariableBinding) : Bool :=
  match handler.lifecycle with
  | .compensating restoredContext _ =>
      if !restoredContextMatchesInput body trigger.owner handler.identity.subject restoredContext then
        false
      else match body.input, restoredContext, arguments with
        | .empty, none, [] => true
        | .restoredProcessBinding sourceName argumentName, some snapshot, [argument] =>
            match snapshot.frames with
            | processFrame :: _ =>
                match processFrame.bindings.filter fun binding => binding.name == sourceName with
                | [source] => argument.name == argumentName && argument.value == source.value
                | _ => false
            | _ => false
        | _, _, _ => false
  | _ => false

private def waitMatchesHandler (program : Program)
    (triggers : List CompensationTriggerExecution)
    (wait : CompensationHandlerEffectWait) : Bool :=
  match triggers.filter fun trigger => trigger.id == wait.triggerId with
  | [trigger] =>
      match trigger.handlers.filter fun handler => handler.identity.id == wait.handlerId with
      | [handler] =>
          match handler.lifecycle,
              compensationSubjectDefinitionForOccurrence? program handler.identity.subject with
          | .compensating _ effectId, some definition =>
              occurrenceIdValid wait.id && occurrenceIdValid wait.triggerId &&
                occurrenceIdValid wait.handlerId && trigger.lifecycle == .active &&
                wait.id == effectId && wait.id.elementId.value == definition.body.effectElementId.value &&
                wait.descriptor == definition.body.descriptor &&
                handlerArgumentsMatch definition.body trigger handler wait.arguments
          | _, _ => false
      | _ => false
  | _ => false

private def waitIdentityBefore
    (left right : CompensationHandlerEffectWait) : Bool :=
  compensationOccurrenceBefore left.id right.id

private def waitIdentityUnique (waits : List CompensationHandlerEffectWait)
    (wait : CompensationHandlerEffectWait) : Bool :=
  (waits.filter fun candidate => candidate.id == wait.id).length = 1

private def handlerHasOneWait (waits : List CompensationHandlerEffectWait)
    (trigger : CompensationTriggerExecution) (handler : CompensationHandlerExecution) : Bool :=
  match handler.lifecycle with
  | .compensating _ effectId =>
      (waits.filter fun wait => wait.triggerId == trigger.id &&
        wait.handlerId == handler.identity.id && wait.id == effectId).length = 1
  | _ => true

private def waitCollidesWithOrdinaryState (state : RuntimeState)
    (wait : CompensationHandlerEffectWait) : Bool :=
  (state.effectWaits.any fun ordinary =>
      ordinary.processInstanceId == wait.id.processInstanceId &&
        ordinary.elementId.value == wait.id.elementId.value && ordinary.activation == wait.id.activation)
    || state.effectIncidents.any fun incident =>
      incident.wait.processInstanceId == wait.id.processInstanceId &&
        incident.wait.elementId.value == wait.id.elementId.value &&
        incident.wait.activation == wait.id.activation

private def controlLifecycleValid (program : Program) (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted =>
      state.compensationTriggers.isEmpty && state.compensationHandlerEffectWaits.isEmpty
  | .running _ =>
      state.compensationTriggers.all fun trigger => trigger.lifecycle != .failed
  | .completed _ | .cancelled _ =>
      state.compensationHandlerEffectWaits.isEmpty &&
        state.compensationTriggers.all fun trigger => trigger.lifecycle != .active
  | .failed .. => failedCompensationStateValid program state

/-- Complete declaration, lifecycle, join, identity, order, collision, and capacity invariant. -/
def compensationExecutionStateValid (program : Program) (state : RuntimeState) : Bool :=
  compensationExecutionDeclarationValid program &&
    match program.compensationExecution with
    | none =>
        state.compensationTriggers.isEmpty && state.compensationHandlerEffectWaits.isEmpty
    | some declaration =>
        strictlyOrdered triggerIdentityBefore state.compensationTriggers &&
          state.compensationTriggers.all (triggerIdentityUnique state.compensationTriggers) &&
          activeCompensationTriggerOwnersUnique state &&
          state.compensationTriggers.all (triggerMatchesDeclaration program state declaration) &&
          strictlyOrdered waitIdentityBefore state.compensationHandlerEffectWaits &&
          state.compensationHandlerEffectWaits.all
            (waitIdentityUnique state.compensationHandlerEffectWaits) &&
          state.compensationHandlerEffectWaits.all
            (waitMatchesHandler program state.compensationTriggers) &&
          (state.compensationTriggers.all fun trigger =>
            trigger.handlers.all (handlerHasOneWait state.compensationHandlerEffectWaits trigger)) &&
          (state.compensationHandlerEffectWaits.all fun wait =>
            !waitCollidesWithOrdinaryState state wait) &&
          state.compensationTriggers.length ≤ declaration.limits.maxTriggers &&
          (state.compensationTriggers.all fun trigger =>
            trigger.handlers.length ≤ declaration.limits.maxHandlers) &&
          canonicalCompensationExecutionStateUtf8Bytes state.compensationTriggers
              state.compensationHandlerEffectWaits ≤ declaration.limits.maxCanonicalBytes &&
          controlLifecycleValid program state

/-- COMPEMPTY-CAPACITY-01 makes empty compensation work valid before and immediately after start. -/
theorem compensationExecutionStateValid_empty (program : Program) (state : RuntimeState)
    (declarationValid : compensationExecutionDeclarationValid program = true)
    (triggers : state.compensationTriggers = [])
    (waits : state.compensationHandlerEffectWaits = [])
    (control : state.control = .notStarted ∨ ∃ instanceId, state.control = .running instanceId) :
    compensationExecutionStateValid program state = true := by
  cases present : program.compensationExecution with
  | none => simp [compensationExecutionStateValid, declarationValid, present, triggers, waits]
  | some declaration =>
      have capacity := compensationExecutionDeclarationValid_minimumBytes
        program declaration present declarationValid
      rcases control with notStarted | ⟨instanceId, running⟩ <;>
        simp [compensationExecutionStateValid, strictlyOrdered, activeCompensationTriggerOwnersUnique,
          canonicalCompensationExecutionStateUtf8Bytes, canonicalArrayUtf8Bytes,
          controlLifecycleValid, *]

/-- Running compensation validity reads no ordinary task body or Activity counter; callers frame its exact owners and effect collision census. -/
theorem compensationExecutionStateValid_running_frame (program : Program)
    (before after : RuntimeState) (instanceId : SemanticId)
    (beforeRunning : before.control = .running instanceId)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (triggersFrame : after.compensationTriggers = before.compensationTriggers)
    (handlerWaitsFrame : after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits)
    (effectsFrame : after.effectWaits = before.effectWaits)
    (incidentsFrame : after.effectIncidents = before.effectIncidents) :
    compensationExecutionStateValid program after =
      compensationExecutionStateValid program before := by
  have matching : triggerMatchesDeclaration program after =
      triggerMatchesDeclaration program before := by
    funext declaration trigger
    simp [triggerMatchesDeclaration, triggerLifecycleValid, controlFrame, beforeRunning,
      scopesFrame]
  simp [compensationExecutionStateValid, activeCompensationTriggerOwnersUnique,
    matching, waitCollidesWithOrdinaryState,
    controlLifecycleValid, controlFrame, beforeRunning, triggersFrame,
    handlerWaitsFrame, effectsFrame, incidentsFrame]

private theorem compensationSubjectDefinitionForOccurrence?_member (program : Program)
    (occurrence : CompensationSubjectOccurrence) (definition : CompensationSubjectDefinition)
    (found : compensationSubjectDefinitionForOccurrence? program occurrence = some definition) :
    ∃ declaration, program.compensationExecution = some declaration ∧
      definition ∈ declaration.subjects := by
  unfold compensationSubjectDefinitionForOccurrence? at found
  cases present : program.compensationExecution with
  | none => simp [present] at found
  | some declaration =>
      simp only [present] at found
      dsimp only [Bind.bind, Option.bind] at found
      split at found
      · rename_i subject filtered
        simp only [Option.some.injEq] at found
        subst definition
        exact ⟨declaration, rfl, (List.mem_filter.mp
          (filtered.symm ▸ (by simp : subject ∈ [subject]))).1⟩
      · contradiction

private theorem waitMatchesHandler_effect_definition (program : Program)
    (triggers : List CompensationTriggerExecution) (wait : CompensationHandlerEffectWait)
    (matching : waitMatchesHandler program triggers wait = true) :
    ∃ declaration definition, program.compensationExecution = some declaration ∧
      definition ∈ declaration.subjects ∧
      wait.id.elementId.value = definition.body.effectElementId.value := by
  unfold waitMatchesHandler at matching
  split at matching
  · rename_i trigger triggersEq
    split at matching
    · rename_i handler handlersEq
      split at matching
      · rename_i restoredContext effectId definition lifecycleEq definitionEq
        have declared := compensationSubjectDefinitionForOccurrence?_member program
          handler.identity.subject definition definitionEq
        obtain ⟨declaration, present, member⟩ := declared
        simp only [Bool.and_eq_true, beq_iff_eq] at matching
        exact ⟨declaration, definition, present, member, matching.1.1.2⟩
      · contradiction
    · contradiction
  · contradiction

theorem compensationExecutionStateValid_awaitEffect_disjoint (program : Program)
    (state : RuntimeState) (valid : compensationExecutionStateValid program state = true)
    (id : OperationId) (origin : BpmnElementOrigin) (input output : ControlPlaceId)
    (effect : EffectDefinition) (route : Option BpmnErrorRoute)
    (operationMember : .awaitEffect id origin input output effect route ∈ program.operations)
    (elementId : NodeId) (aligned : origin.elementId = elementId)
    (wait : CompensationHandlerEffectWait) (waitMember : wait ∈ state.compensationHandlerEffectWaits) :
    elementId.value ≠ wait.id.elementId.value := by
  have declarationValid : compensationExecutionDeclarationValid program = true :=
    (Bool.and_eq_true_iff.mp valid).1
  have matching : waitMatchesHandler program state.compensationTriggers wait = true := by
    cases present : program.compensationExecution with
    | none =>
        simp [compensationExecutionStateValid, present] at valid
        simp_all
    | some declaration =>
        simp only [compensationExecutionStateValid, present, Bool.and_eq_true] at valid
        exact List.all_eq_true.mp valid.2.1.1.1.1.1.1.2 wait waitMember
  obtain ⟨declaration, definition, present, member, elementEq⟩ :=
    waitMatchesHandler_effect_definition program state.compensationTriggers wait matching
  have excluded := compensationExecutionDeclarationValid_awaitEffect_body_disjoint
    program declaration present declarationValid id origin input output effect route
      operationMember definition member
  intro same
  have bodyEq : origin.elementId = definition.body.effectElementId := by
    rw [aligned]
    exact congrArg NodeId.mk (same.trans elementEq)
  apply excluded
  cases definition <;> simp_all [CompensationSubjectDefinition.body]

theorem compensationExecutionStateValid_running_insertEffect_frame (program : Program)
    (before after : RuntimeState) (instanceId : SemanticId) (inserted : EffectWait)
    (beforeRunning : before.control = .running instanceId)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (triggersFrame : after.compensationTriggers = before.compensationTriggers)
    (handlerWaitsFrame : after.compensationHandlerEffectWaits = before.compensationHandlerEffectWaits)
    (effectsFrame : after.effectWaits = insertEffectWait inserted before.effectWaits)
    (incidentsFrame : after.effectIncidents = before.effectIncidents)
    (disjoint : ∀ wait ∈ before.compensationHandlerEffectWaits,
      inserted.elementId.value ≠ wait.id.elementId.value)
    (incidentDisjoint : ∀ incident ∈ before.effectIncidents,
      ∀ wait ∈ before.compensationHandlerEffectWaits,
        incident.wait.elementId.value ≠ wait.id.elementId.value) :
    compensationExecutionStateValid program after =
      compensationExecutionStateValid program before := by
  have matching : triggerMatchesDeclaration program after =
      triggerMatchesDeclaration program before := by
    funext declaration trigger
    simp [triggerMatchesDeclaration, triggerLifecycleValid, controlFrame, beforeRunning,
      scopesFrame]
  have collisionFrame (wait : CompensationHandlerEffectWait)
      (member : wait ∈ before.compensationHandlerEffectWaits) :
      waitCollidesWithOrdinaryState after wait = waitCollidesWithOrdinaryState before wait := by
    have rejected : (inserted.processInstanceId == wait.id.processInstanceId &&
        inserted.elementId.value == wait.id.elementId.value &&
        inserted.activation == wait.id.activation) = false := by
      simp [disjoint wait member]
    have incidentsAbsent : (before.effectIncidents.any fun incident =>
        incident.wait.processInstanceId == wait.id.processInstanceId &&
          incident.wait.elementId.value == wait.id.elementId.value &&
          incident.wait.activation == wait.id.activation) = false := by
      apply Bool.eq_false_iff.mpr
      intro present
      obtain ⟨incident, incidentMember, matched⟩ := List.any_eq_true.mp present
      simp only [Bool.and_eq_true, beq_iff_eq] at matched
      exact incidentDisjoint incident incidentMember wait member matched.1.2
    have anyFrame : ∀ values : List EffectWait,
        (canonicalInsertBy effectWaitBefore inserted values).any (fun ordinary =>
          ordinary.processInstanceId == wait.id.processInstanceId &&
            ordinary.elementId.value == wait.id.elementId.value &&
            ordinary.activation == wait.id.activation) =
        values.any (fun ordinary =>
          ordinary.processInstanceId == wait.id.processInstanceId &&
            ordinary.elementId.value == wait.id.elementId.value &&
            ordinary.activation == wait.id.activation) := by
      intro values
      induction values with
      | nil => simp [canonicalInsertBy, rejected]
      | cons current rest ih =>
          simp only [canonicalInsertBy]
          split <;> simp [rejected, ih]
    simp only [waitCollidesWithOrdinaryState, effectsFrame, incidentsFrame,
      incidentsAbsent, Bool.or_false, insertEffectWait, anyFrame]
  have collisions :
      (after.compensationHandlerEffectWaits.all fun wait =>
        !waitCollidesWithOrdinaryState after wait) =
      (before.compensationHandlerEffectWaits.all fun wait =>
        !waitCollidesWithOrdinaryState before wait) := by
    rw [handlerWaitsFrame]
    apply Bool.eq_iff_iff.mpr
    simp only [List.all_eq_true]
    constructor <;> intro valid wait member
    · rw [← collisionFrame wait member]
      exact valid wait member
    · rw [collisionFrame wait member]
      exact valid wait member
  simp only [compensationExecutionStateValid, collisions]
  simp [activeCompensationTriggerOwnersUnique, matching, controlLifecycleValid,
    controlFrame, beforeRunning, triggersFrame, handlerWaitsFrame]

end BpmnSemantics.SemanticProcess
