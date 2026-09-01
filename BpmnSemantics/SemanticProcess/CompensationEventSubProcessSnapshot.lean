import BpmnSemantics.SemanticProcess.CanonicalJsonStringCollection
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotDeclaration
import BpmnSemantics.SemanticProcess.RuntimeState

/-! # Compensation Event Sub-Process parent-context snapshots

This module owns the approved pure runtime account for reserving, promoting, validating, measuring, and purging hidden parent-context snapshots. Transition integration remains with the operation-family owners.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def safeNat (value : Nat) : Bool :=
  BpmnSemantics.SemanticProcessJson.isSafeWireNat value

def CompensationParentContextRetention.parent :
    CompensationParentContextRetention → RuntimeScopeOccurrence
  | .provisional parent _ | .promoted parent _ _ => parent

def CompensationParentContextRetention.handlerScopeId :
    CompensationParentContextRetention → DefinitionScopeId
  | .provisional _ handlerScopeId | .promoted _ handlerScopeId _ => handlerScopeId

def CompensationParentContextRetention.isProvisional :
    CompensationParentContextRetention → Bool
  | .provisional .. => true
  | .promoted .. => false

def CompensationParentContextRetention.isPromoted :
    CompensationParentContextRetention → Bool
  | .provisional .. => false
  | .promoted .. => true

/-! ## Exact canonical JSON byte measure -/

def canonicalScopeOccurrenceIdUtf8Bytes (id : ScopeOccurrenceId) : Nat :=
  "{\"activation\":".utf8ByteSize + (toString id.activation).utf8ByteSize +
    ",\"definitionScopeId\":".utf8ByteSize +
      canonicalJsonStringUtf8Bytes id.definitionScopeId.value +
    ",\"processInstanceId\":".utf8ByteSize +
      canonicalJsonStringUtf8Bytes id.processInstanceId.value +
    "}".utf8ByteSize

def canonicalRuntimeScopeOccurrenceUtf8Bytes
    (occurrence : RuntimeScopeOccurrence) : Nat :=
  "{\"id\":".utf8ByteSize + canonicalScopeOccurrenceIdUtf8Bytes occurrence.id +
    ",\"parent\":".utf8ByteSize +
      (match occurrence.parent with
       | none => "null".utf8ByteSize
       | some parent => canonicalScopeOccurrenceIdUtf8Bytes parent) +
    "}".utf8ByteSize

def canonicalVariableValueUtf8Bytes : VariableValue → Nat
  | .string value =>
      "{\"kind\":\"string\",\"value\":".utf8ByteSize +
        canonicalJsonStringUtf8Bytes value + "}".utf8ByteSize
  | .boolean value =>
      "{\"kind\":\"boolean\",\"value\":".utf8ByteSize +
        (if value then "true".utf8ByteSize else "false".utf8ByteSize) +
        "}".utf8ByteSize
  | .integer value =>
      "{\"kind\":\"integer\",\"value\":".utf8ByteSize +
        (toString value).utf8ByteSize + "}".utf8ByteSize
  | .stringList values =>
      "{\"kind\":\"stringList\",\"value\":".utf8ByteSize +
        canonicalJsonStringCollectionUtf8Bytes values + "}".utf8ByteSize
  | .null => "{\"kind\":\"null\"}".utf8ByteSize

def canonicalVariableBindingUtf8Bytes (binding : VariableBinding) : Nat :=
  "{\"name\":".utf8ByteSize + canonicalJsonStringUtf8Bytes binding.name +
    ",\"value\":".utf8ByteSize + canonicalVariableValueUtf8Bytes binding.value +
    "}".utf8ByteSize

private def canonicalArrayUtf8Bytes (measure : α → Nat) : List α → Nat
  | [] => 2
  | first :: rest =>
      rest.foldl (fun total value => total + measure value + 1) (measure first) + 2

def canonicalVariableBindingsUtf8Bytes (bindings : List VariableBinding) : Nat :=
  canonicalArrayUtf8Bytes canonicalVariableBindingUtf8Bytes bindings

def canonicalCompensationParentContextFrameUtf8Bytes
    (frame : CompensationParentContextFrame) : Nat :=
  "{\"bindings\":".utf8ByteSize +
      canonicalVariableBindingsUtf8Bytes frame.bindings +
    ",\"owner\":".utf8ByteSize + canonicalScopeOccurrenceIdUtf8Bytes frame.owner +
    "}".utf8ByteSize

def canonicalCompensationParentContextSnapshotUtf8Bytes
    (snapshot : CompensationParentContextSnapshot) : Nat :=
  "{\"frames\":".utf8ByteSize +
      canonicalArrayUtf8Bytes canonicalCompensationParentContextFrameUtf8Bytes
        snapshot.frames +
    "}".utf8ByteSize

def canonicalCompensationParentContextRetentionUtf8Bytes :
    CompensationParentContextRetention → Nat
  | .provisional parent handlerScopeId =>
      "{\"handlerScopeId\":".utf8ByteSize +
          canonicalJsonStringUtf8Bytes handlerScopeId.value +
        ",\"kind\":\"provisional\",\"parent\":".utf8ByteSize +
          canonicalRuntimeScopeOccurrenceUtf8Bytes parent +
        "}".utf8ByteSize
  | .promoted parent handlerScopeId snapshot =>
      "{\"handlerScopeId\":".utf8ByteSize +
          canonicalJsonStringUtf8Bytes handlerScopeId.value +
        ",\"kind\":\"promoted\",\"parent\":".utf8ByteSize +
          canonicalRuntimeScopeOccurrenceUtf8Bytes parent +
        ",\"snapshot\":".utf8ByteSize +
          canonicalCompensationParentContextSnapshotUtf8Bytes snapshot +
        "}".utf8ByteSize

def canonicalCompensationParentContextRetentionsUtf8Bytes
    (retentions : List CompensationParentContextRetention) : Nat :=
  canonicalArrayUtf8Bytes canonicalCompensationParentContextRetentionUtf8Bytes retentions

/-! ## Canonical key and lifecycle validity -/

def compensationParentContextRetentionBefore
    (left right : CompensationParentContextRetention) : Bool :=
  if left.parent.id = right.parent.id then
    decide (left.handlerScopeId.value < right.handlerScopeId.value)
  else
    scopeOwnerBefore left.parent.id right.parent.id

private def strictlyOrdered : List CompensationParentContextRetention → Bool
  | [] | [_] => true
  | left :: right :: rest =>
      compensationParentContextRetentionBefore left right &&
        strictlyOrdered (right :: rest)

private def retentionKeyMatches
    (left right : CompensationParentContextRetention) : Bool :=
  left.parent.id == right.parent.id &&
    left.handlerScopeId == right.handlerScopeId

private def retentionKeyUnique
    (retentions : List CompensationParentContextRetention)
    (retention : CompensationParentContextRetention) : Bool :=
  (retentions.filter (retentionKeyMatches retention)).length = 1

private def scopeOccurrenceIdValid (id : ScopeOccurrenceId) : Bool :=
  !id.processInstanceId.value.isEmpty &&
    !id.definitionScopeId.value.isEmpty && id.activation > 0 && safeNat id.activation

private def runtimeScopeOccurrenceValid (occurrence : RuntimeScopeOccurrence) : Bool :=
  scopeOccurrenceIdValid occurrence.id &&
    match occurrence.parent with
    | none => true
    | some parent => scopeOccurrenceIdValid parent

def compensationParentContextBindingsValid (bindings : List VariableBinding) : Bool :=
  bindings.all (fun binding =>
      !binding.name.isEmpty &&
        BpmnSemantics.SemanticProcessJson.variableValueWellFormed binding.value) &&
    BpmnSemantics.SemanticProcessJson.bindingNamesStrictlyIncrease bindings

private def targetForParent? (program : Program) (parentScopeId : DefinitionScopeId) :
    Option CompensationEventSubProcessSnapshotTarget :=
  match program.compensationEventSubProcessSnapshots with
  | none => none
  | some declaration =>
      declaration.targets.find? fun target => target.parentScopeId == parentScopeId

private def retentionTargetValid (program : Program)
    (retention : CompensationParentContextRetention) : Bool :=
  match targetForParent? program retention.parent.id.definitionScopeId with
  | none => false
  | some target => target.handlerScopeId == retention.handlerScopeId

private def retentionParentMatchesProgram (program : Program)
    (retention : CompensationParentContextRetention) : Bool :=
  match programEntryRootScopeId? program with
  | none => false
  | some rootScopeId =>
      if retention.parent.id.definitionScopeId = rootScopeId then
        retention.parent.parent.isNone && retention.parent.id.activation == 1
      else
        match retention.parent.parent with
        | none => false
        | some parent =>
            parent.definitionScopeId == rootScopeId &&
              parent.processInstanceId == retention.parent.id.processInstanceId &&
              parent.activation == 1

private def frameValid (frame : CompensationParentContextFrame) : Bool :=
  scopeOccurrenceIdValid frame.owner &&
    compensationParentContextBindingsValid frame.bindings

private def snapshotFramesValid (parent : RuntimeScopeOccurrence)
    (snapshot : CompensationParentContextSnapshot) (root : ScopeOccurrenceId) : Bool :=
  match parent.parent, snapshot.frames with
  | none, [frame] =>
      frame.owner == parent.id && frameValid frame
  | some _, [rootFrame, parentFrame] =>
      rootFrame.owner == root && frameValid rootFrame &&
        parentFrame.owner == parent.id && frameValid parentFrame &&
        parentFrame.bindings.isEmpty
  | _, _ => false

private def exactRuntimeOccurrenceLive (state : RuntimeState)
    (target : RuntimeScopeOccurrence) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => occurrence == target).length = 1

private def exactOccurrenceIdAbsent (state : RuntimeState)
    (target : ScopeOccurrenceId) : Bool :=
  !(state.scopeOccurrences.any fun occurrence => occurrence.id == target)

private def selectedLiveParents (program : Program) (state : RuntimeState) :
    List RuntimeScopeOccurrence :=
  state.scopeOccurrences.filter fun occurrence =>
    (targetForParent? program occurrence.id.definitionScopeId).isSome

private def selectedLiveParentReserved
    (retentions : List CompensationParentContextRetention)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  (retentions.filter fun retention =>
    match retention with
    | .provisional parent _ => parent == occurrence
    | .promoted .. => false).length = 1

private def runningRetentionValid (state : RuntimeState) (root : ScopeOccurrenceId) :
    CompensationParentContextRetention → Bool
  | .provisional parent _ => exactRuntimeOccurrenceLive state parent
  | .promoted parent _ snapshot =>
      match parent.parent with
      | none => false
      | some parentRoot =>
          exactOccurrenceIdAbsent state parent.id && parentRoot == root &&
            snapshotFramesValid parent snapshot root

private def runningLifecycleValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState)
    (retentions : List CompensationParentContextRetention) : Bool :=
  match programEntryRootScopeId? program with
  | none => false
  | some rootScopeId =>
      match state.scopeOccurrences.filter fun occurrence =>
          occurrence.parent.isNone &&
            occurrence.id.definitionScopeId == rootScopeId &&
            occurrence.id.processInstanceId == instanceId with
      | [root] =>
          (selectedLiveParents program state).all
              (selectedLiveParentReserved retentions) &&
            retentions.all (runningRetentionValid state root.id)
      | _ => false

private def completedRootRetentions (rootScopeId : DefinitionScopeId)
    (instanceId : SemanticId)
    (retentions : List CompensationParentContextRetention) :
    List CompensationParentContextRetention :=
  retentions.filter fun retention =>
    retention.isPromoted && retention.parent.parent.isNone &&
      retention.parent.id.definitionScopeId == rootScopeId &&
      retention.parent.id.processInstanceId == instanceId

private def completedRetentionValid
    (roots : List CompensationParentContextRetention) :
    CompensationParentContextRetention → Bool
  | .provisional .. => false
  | .promoted parent _ snapshot =>
      match parent.parent with
      | none =>
          match roots with
          | [root] => snapshotFramesValid parent snapshot root.parent.id
          | _ => false
      | some parentRoot =>
          match roots.filter fun root => root.parent.id == parentRoot with
          | [root] => snapshotFramesValid parent snapshot root.parent.id
          | _ => false

private def completedLifecycleValid (program : Program) (instanceId : SemanticId)
    (retentions : List CompensationParentContextRetention) : Bool :=
  match programEntryRootScopeId? program with
  | none => false
  | some rootScopeId =>
      let roots := completedRootRetentions rootScopeId instanceId retentions
      let rootSelected := (targetForParent? program rootScopeId).isSome
      roots.length == (if rootSelected then 1 else 0) &&
        retentions.all (completedRetentionValid roots)

private def retentionLifecycleValid (program : Program) (state : RuntimeState)
    (retentions : List CompensationParentContextRetention) : Bool :=
  match state.control with
  | .notStarted | .cancelled _ => retentions.isEmpty
  | .running instanceId => runningLifecycleValid program instanceId state retentions
  | .completed instanceId => completedLifecycleValid program instanceId retentions

/-- Exact declaration-aware validity for the hidden snapshot collection. -/
def compensationEventSubProcessSnapshotStateValid (program : Program)
    (state : RuntimeState) : Bool :=
  compensationEventSubProcessSnapshotDeclarationValid program &&
    match program.compensationEventSubProcessSnapshots with
    | none => state.compensationParentContextRetentions.isEmpty
    | some declaration =>
        let retentions := state.compensationParentContextRetentions
        strictlyOrdered retentions &&
          retentions.all (retentionKeyUnique retentions) &&
          (retentions.all fun retention =>
            runtimeScopeOccurrenceValid retention.parent &&
              retentionTargetValid program retention &&
              retentionParentMatchesProgram program retention &&
              (match retention with
               | .provisional .. => true
               | .promoted _ _ snapshot => snapshot.frames.all frameValid)) &&
          retentions.length ≤ declaration.maxRecords &&
          canonicalCompensationParentContextRetentionsUtf8Bytes retentions ≤
            declaration.maxCanonicalBytes &&
          retentionLifecycleValid program state retentions

/-! ## Reservation, promotion, and purge -/

inductive CompensationParentContextCapacityMeasure where
  | records
  | canonicalBytes
  deriving Repr, DecidableEq

inductive CompensationParentContextRefusal where
  | invalidProgram
  | invalidState
  | missingRetention
  | duplicateRetention
  | brokenAncestry
  | incompleteContext
  | capacity (measure : CompensationParentContextCapacityMeasure)
      (bound prospective : Nat)
  deriving Repr, DecidableEq

inductive CompensationParentContextResult where
  | disabled (state : RuntimeState)
  | applied (state : RuntimeState)
  | refused (reason : CompensationParentContextRefusal) (state : RuntimeState)
  deriving Repr, DecidableEq

inductive CompensationParentContextRootDisposition where
  | discard
  | retainPromoted
  deriving Repr, DecidableEq

private def prospectiveParentValid (program : Program) (state : RuntimeState)
    (parent : RuntimeScopeOccurrence) : Bool :=
  runtimeScopeOccurrenceValid parent &&
    match programEntryRootScopeId? program with
    | none => false
    | some rootScopeId =>
        if parent.id.definitionScopeId = rootScopeId then
          parent.parent.isNone && parent.id.activation == 1 &&
            state.control == .notStarted && state.scopeOccurrences.isEmpty
        else
          match parent.parent, state.control with
          | some root, .running instanceId =>
              root.definitionScopeId == rootScopeId &&
                root.processInstanceId == parent.id.processInstanceId &&
                root.activation == 1 && instanceId == parent.id.processInstanceId &&
                (state.scopeOccurrences.filter fun occurrence =>
                  occurrence.parent.isNone && occurrence.id == root).length = 1 &&
                exactOccurrenceIdAbsent state parent.id
          | _, _ => false

private def capacityRefusal? (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (retentions : List CompensationParentContextRetention) :
    Option CompensationParentContextRefusal :=
  if retentions.length > declaration.maxRecords then
    some (.capacity .records declaration.maxRecords retentions.length)
  else
    let observed := canonicalCompensationParentContextRetentionsUtf8Bytes retentions
    if observed > declaration.maxCanonicalBytes then
      some (.capacity .canonicalBytes declaration.maxCanonicalBytes observed)
    else none

/-- Reserve one exact parent occurrence before root start or direct-child entry. -/
def reserveCompensationParentContext (program : Program) (state : RuntimeState)
    (parent : RuntimeScopeOccurrence) : CompensationParentContextResult :=
  if !compensationEventSubProcessSnapshotDeclarationValid program then
    .refused .invalidProgram state
  else if !compensationEventSubProcessSnapshotStateValid program state then
    .refused .invalidState state
  else
    match program.compensationEventSubProcessSnapshots,
        targetForParent? program parent.id.definitionScopeId with
    | none, _ | _, none => .disabled state
    | some declaration, some target =>
        if !prospectiveParentValid program state parent then
          .refused .invalidState state
        else
          let reservation := .provisional parent target.handlerScopeId
          if state.compensationParentContextRetentions.any
              (retentionKeyMatches reservation) then
            .refused .duplicateRetention state
          else
            let prospective := canonicalInsertBy
              compensationParentContextRetentionBefore reservation
              state.compensationParentContextRetentions
            match capacityRefusal? declaration prospective with
            | some reason => .refused reason state
            | none =>
                .applied { state with compensationParentContextRetentions := prospective }

private def captureCompensationParentContext? (program : Program)
    (state : RuntimeState) (parent : RuntimeScopeOccurrence) :
    Option CompensationParentContextSnapshot :=
  if !exactRuntimeOccurrenceLive state parent then none
  else
    match programEntryRootScopeId? program, parent.parent with
    | some rootScopeId, none =>
        if parent.id.definitionScopeId = rootScopeId then
          some { frames :=
            [{ owner := parent.id, bindings := state.variables.process.bindings }] }
        else none
    | some rootScopeId, some rootId =>
        match state.scopeOccurrences.filter fun occurrence =>
            occurrence.parent.isNone && occurrence.id == rootId with
        | [root] =>
            if root.id.definitionScopeId = rootScopeId then
              some { frames :=
                [ { owner := root.id, bindings := state.variables.process.bindings }
                , { owner := parent.id, bindings := [] } ] }
            else none
        | _ => none
    | none, _ => none

private def promoteMatchingRetention (parent : RuntimeScopeOccurrence)
    (target : CompensationEventSubProcessSnapshotTarget)
    (snapshot : CompensationParentContextSnapshot) :
    CompensationParentContextRetention → CompensationParentContextRetention
  | current@(.provisional retainedParent handlerScopeId) =>
      if retainedParent.id = parent.id && handlerScopeId = target.handlerScopeId then
        .promoted parent target.handlerScopeId snapshot
      else current
  | current@(.promoted ..) => current

/-- Promote one exact provisional record using the pre-completion Process/Sub-Process context. -/
def promoteCompensationParentContext (program : Program) (state : RuntimeState)
    (parent : RuntimeScopeOccurrence) : CompensationParentContextResult :=
  if !compensationEventSubProcessSnapshotDeclarationValid program then
    .refused .invalidProgram state
  else if !compensationEventSubProcessSnapshotStateValid program state then
    .refused .invalidState state
  else
    match program.compensationEventSubProcessSnapshots,
        targetForParent? program parent.id.definitionScopeId with
    | none, _ | _, none => .disabled state
    | some declaration, some target =>
        if !compensationParentContextBindingsValid state.variables.process.bindings then
          .refused .incompleteContext state
        else
          let selected := state.compensationParentContextRetentions.filter fun retention =>
            retention.parent.id == parent.id &&
              retention.handlerScopeId == target.handlerScopeId
          match selected with
          | [] => .refused .missingRetention state
          | _first :: _second :: _ =>
              .refused .duplicateRetention state
          | [retention] =>
              match retention with
              | .promoted .. => .refused .invalidState state
              | .provisional retainedParent _ =>
                  if retainedParent != parent then .refused .invalidState state
                  else
                    match captureCompensationParentContext? program state parent with
                    | none => .refused .brokenAncestry state
                    | some snapshot =>
                        let prospective :=
                          state.compensationParentContextRetentions.map
                            (promoteMatchingRetention parent target snapshot)
                        match capacityRefusal? declaration prospective with
                        | some reason => .refused reason state
                        | none => .applied
                            { state with
                              compensationParentContextRetentions := prospective }

/-- Remove only an unsuccessful parent's provisional reservation; completed snapshots survive. -/
def purgeCompensationParentContextForParent (state : RuntimeState)
    (parent : RuntimeScopeOccurrence) : RuntimeState :=
  { state with
    compensationParentContextRetentions :=
      state.compensationParentContextRetentions.filter fun retention =>
        match retention with
        | .provisional retainedParent _ => retainedParent.id != parent.id
        | .promoted .. => true }

private def retentionOwnedByRoot (root : RuntimeScopeOccurrence)
    (retention : CompensationParentContextRetention) : Bool :=
  retention.parent.id == root.id || retention.parent.parent == some root.id

/-- Purge a root's whole collection, or retain only its promoted root-and-child records. -/
def purgeCompensationParentContextForRoot (state : RuntimeState)
    (root : RuntimeScopeOccurrence)
    (disposition : CompensationParentContextRootDisposition) : RuntimeState :=
  { state with
    compensationParentContextRetentions :=
      state.compensationParentContextRetentions.filter fun retention =>
        !retentionOwnedByRoot root retention ||
          (disposition == .retainPromoted && retention.isPromoted) }

end BpmnSemantics.SemanticProcess
