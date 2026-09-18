import BpmnSemantics.SemanticProcess.Transition

/-! Predecessor selection and retained patches for ordinary child entry and Call invocation in the
[Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md).
-/

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

inductive InternalScopeCreationKind where
  | child
  | called (record : CalledProcessOccurrence)
  deriving Repr, DecidableEq

structure InternalScopeCreationSelection where
  operation : SemanticOperation
  owner : ScopeOccurrenceId
  input : ControlPlaceId
  entry : ControlPlaceId
  created : RuntimeScopeOccurrence
  kind : InternalScopeCreationKind
  deriving Repr, DecidableEq

/-- The retained creation kind identifies the sole issuance counter and optional Call record. -/
def InternalScopeCreationSelection.apply (state : RuntimeState)
    (selected : InternalScopeCreationSelection) : RuntimeState :=
  let tokens := addToken (removeToken state.tokens selected.input selected.owner)
    selected.entry selected.created.id
  let scopes := insertScopeOccurrence selected.created state.scopeOccurrences
  match selected.kind with
  | .child =>
      { state with
        tokens := tokens
        scopeOccurrences := scopes
        scopeActivations := setScopeActivationCount state.scopeActivations
          selected.created.id.definitionScopeId selected.created.id.activation }
  | .called record =>
      { state with
        tokens := tokens
        scopeOccurrences := scopes
        calledProcessOccurrences := sortCallRecords (record :: state.calledProcessOccurrences)
        callActivations := setCallActivationCount state
          ⟨record.id.elementId.value⟩ record.id.activation }

/-- Selection preserves the current Lean restriction to the hosting Process owner; the approved
scope-creation account does not extend admission to child entry inside a called Process. -/
def selectInternalScopeCreation? (state : RuntimeState) (operation : SemanticOperation) :
    Option InternalScopeCreationSelection :=
  (match state.control with
    | .running instanceId => some instanceId
    | _ => none).bind fun hosting => do
  match operation with
  | .enterScope _ _ input entry definition =>
      let owner ← onlyTokenOwner? state input
      if owner.processInstanceId ≠ hosting ||
          state.scopeOccurrences.any fun occurrence =>
            occurrence.id.definitionScopeId == definition then none
      else
        let created : RuntimeScopeOccurrence :=
          { id := { processInstanceId := hosting, definitionScopeId := definition
                    activation := scopeActivationCount state definition + 1 }
            parent := some owner }
        pure { operation, owner, input, entry, created, kind := .child }
  | .invokeProcess _ origin input process definition entry returnOperation =>
      let owner ← onlyTokenOwner? state input
      if (state.tokens.filter fun token : ControlToken =>
          decide (token.placeId = input && token.owner = owner)).length ≠ 1 then none
      else
      if calledProcessAssociationsValid state then
        if owner.processInstanceId = hosting then
          if (state.calledProcessOccurrences.filter fun record : CalledProcessOccurrence =>
              record.caller = owner && record.id.elementId.value = origin.elementId.value).length = 0 then
            match state.scopeOccurrences.filter fun occurrence : RuntimeScopeOccurrence =>
                decide (occurrence.id = owner) with
            | [callerRoot] =>
                if callerRoot.id = owner && callerRoot.parent.isNone then
                  let activation := callActivationCount state origin.elementId + 1
                  let calledInstance := deriveCalledProcessInstanceId owner.processInstanceId
                    origin.elementId activation
                  let created : RuntimeScopeOccurrence :=
                    { id := { processInstanceId := calledInstance, definitionScopeId := definition
                              activation := 1 }
                      parent := none }
                  let record : CalledProcessOccurrence :=
                    { id := { processInstanceId := owner.processInstanceId
                              elementId := ⟨origin.elementId.value⟩, activation }
                      caller := owner, calledProcessId := process, calledRoot := created.id
                      returnOperationId := returnOperation }
                  if (state.scopeOccurrences.filter fun occurrence : RuntimeScopeOccurrence =>
                        decide (occurrence.id.processInstanceId = calledInstance)).length = 0 then
                    if (state.calledProcessOccurrences.filter fun candidate : CalledProcessOccurrence =>
                        decide (candidate.id = record.id ||
                          candidate.calledRoot.processInstanceId = calledInstance)).length = 0 then
                      pure { operation, owner, input, entry, created, kind := .called record }
                    else none
                  else none
                else none
            | _ => none
          else none
        else none
      else none
  | _ => none

/-- Child occurrence identity advances the predecessor's retained issuance high-water mark. -/
theorem scopeCreationSelection_child_issued_activation (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (definition : DefinitionScopeId) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state (.enterScope id origin input entry definition) =
      some selected) :
    selected.created.id.activation = scopeActivationCount state definition + 1 := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
  split at found
  · contradiction
  · cases found; rfl

/-- Call ownership alone does not justify consuming a duplicated input population. -/
theorem scopeCreationSelection_call_duplicate_input_refused (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (input entry : ControlPlaceId)
    (process : ProcessId) (definition : DefinitionScopeId) (returnOperation : OperationId)
    (hosting : SemanticId) (owner : ScopeOccurrenceId)
    (running : state.control = .running hosting)
    (owned : onlyTokenOwner? state input = some owner)
    (duplicate : (state.tokens.filter fun token =>
      decide (token.placeId = input && token.owner = owner)).length ≠ 1) :
    selectInternalScopeCreation? state
      (.invokeProcess id origin input process definition entry returnOperation) = none := by
  simp_all [selectInternalScopeCreation?]

/-- A selection retains the complete operation rather than reconstructing it from a successor. -/
theorem selectInternalScopeCreation_operation (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    selected.operation = operation := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, _, found⟩ := Option.bind_eq_some_iff.mp found
  cases operation
  all_goals first
    | contradiction
    | obtain ⟨owner, _, found⟩ := Option.bind_eq_some_iff.mp found
      dsimp only at found
      repeat first | contradiction | (solve | cases found <;> rfl) | split at found

/-- Successful selection is confined to running control. -/
theorem selectInternalScopeCreation_running (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (found : selectInternalScopeCreation? state operation = some selected) :
    ∃ hosting, state.control = .running hosting := by
  unfold selectInternalScopeCreation? at found
  obtain ⟨hosting, running, _⟩ := Option.bind_eq_some_iff.mp found
  cases control : state.control <;> simp [control] at running
  exact ⟨_, rfl⟩

/-- Retained patches agree with the existing evaluator under the approved snapshot exclusion;
this is not a footprint, validity-preservation, or commutation claim. -/
theorem selectInternalScopeCreation_refines (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (selected : InternalScopeCreationSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (found : selectInternalScopeCreation? state operation = some selected) :
    fire? program operation state = some (selected.apply state) := by
  obtain ⟨hosting, running⟩ := selectInternalScopeCreation_running state operation selected found
  unfold selectInternalScopeCreation? at found
  simp only [running, bind, Option.bind] at found
  unfold fire?
  rw [snapshotAbsent]
  cases operation with
  | enterScope id origin input entry definition =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      split at found
      · contradiction
      · next fresh =>
          cases found
          change enterScopeState? state input entry definition = _
          simp only [enterScopeState?, owned, running, bind, Option.bind, fresh, Bool.false_eq_true,
            ↓reduceIte,
            InternalScopeCreationSelection.apply]
  | invokeProcess id origin input process definition entry returnOperation =>
      obtain ⟨owner, owned, found⟩ := Option.bind_eq_some_iff.mp found
      change invokeProcessState? state origin input process definition entry returnOperation = _
      have rootSelected : (match state.control with
          | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
          | .notStarted | .failed .. => none) = some hosting := by rw [running]
      unfold invokeProcessState?
      conv =>
        lhs
        arg 3
        change (match state.control with
          | .running instanceId | .completed instanceId | .cancelled instanceId => some instanceId
          | .notStarted | .failed .. => none)
      rw [owned, rootSelected]
      change (if calledProcessAssociationsValid state then
        if owner.processInstanceId = hosting then
          if (state.tokens.filter fun token =>
              decide (token.placeId = input && token.owner = owner)).length = 1 then
            if (state.calledProcessOccurrences.filter fun record =>
                record.caller = owner && record.id.elementId.value = origin.elementId.value).length = 0
              then _ else none
          else none
        else none
      else none) = _
      repeat first | split at found | contradiction
      all_goals cases found
      all_goals simp_all [InternalScopeCreationSelection.apply]
  | _ => simp at found

end BpmnSemantics.SemanticProcess.InternalCommutation
