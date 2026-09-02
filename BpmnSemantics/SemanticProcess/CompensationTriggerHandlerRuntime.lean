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

private def handlerForDefinition? (program : Program)
    (handlers : List CompensationHandlerExecution) (elementId : NodeId) :
    Option CompensationHandlerExecution :=
  handlers.find? fun handler =>
    occurrenceDefinitionId? program handler.identity.subject = some elementId

private def expectedDependencies (program : Program)
    (declaration : CompensationExecutionDeclaration)
    (handlers : List CompensationHandlerExecution) :
    List CompensationOccurrenceDependency :=
  declaration.dependencies.filterMap fun dependency => do
    let predecessor ← handlerForDefinition? program handlers dependency.predecessorElementId
    let successor ← handlerForDefinition? program handlers dependency.successorElementId
    pure
      { predecessor := predecessor.identity.subject
        successor := successor.identity.subject
        reason := .sequenceFlow }

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
      (match state.control with | .running _ => true | _ => false) &&
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
        trigger.id.elementId.value == declaration.triggerOperationId.value &&
        trigger.id.processInstanceId == trigger.owner.processInstanceId &&
        trigger.owner.definitionScopeId == declaration.definitionScopeId &&
        trigger.output == output &&
        strictlyOrdered handlerIdentityBefore trigger.handlers &&
        trigger.handlers.all (handlerIdentityUnique trigger.handlers) &&
        trigger.handlers.all (handlerSubjectUnique trigger.handlers) &&
        trigger.handlers.all (handlerMatchesDeclaration program trigger.owner) &&
        trigger.dependencies == expectedDependencies program declaration trigger.handlers &&
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
  state.effectWaits.any fun ordinary =>
      ordinary.processInstanceId == wait.id.processInstanceId &&
        ordinary.elementId.value == wait.id.elementId.value && ordinary.activation == wait.id.activation
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

end BpmnSemantics.SemanticProcess
