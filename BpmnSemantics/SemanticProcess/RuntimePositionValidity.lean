import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation

/-! # Runtime position validity

This lower-level owner validates lifecycle state, the runtime scope forest, called-Process root
associations, and token bindings against one immutable Semantic Process program. Public control
projection and committed transition traces consume this predicate but do not define it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

def uniqueControlPlace? (program : Program) (placeId : ControlPlaceId) :
    Option ControlPlace :=
  match program.controlPlaces.filter fun place => decide (place.id = placeId) with
  | [place] =>
      match program.controlPlaces.filter fun candidate => decide (candidate.origin = place.origin) with
      | [_] => some place
      | _ => none
  | _ => none

private def controlPlaceScope? (program : Program) (placeId : ControlPlaceId) :
    Option DefinitionScopeId :=
  match program.controlPlaceScopes.filter fun ownership =>
      decide (ownership.controlPlaceId = placeId) with
  | [ownership] => some ownership.scopeId
  | _ => none

def uniqueDefinitionScope? (program : Program) (scopeId : DefinitionScopeId) :
    Option DefinitionScope :=
  match program.definitionScopes.filter fun scope => decide (scope.id = scopeId) with
  | [scope] =>
      match program.definitionScopes.filter fun candidate =>
          decide (candidate.originElementId = scope.originElementId) with
      | [_] => some scope
      | _ => none
  | _ => none

private def programProjectionBindingsValid (program : Program) : Bool :=
  (program.controlPlaces.all fun place =>
    (program.controlPlaces.filter fun candidate =>
      decide (candidate.origin = place.origin)).length = 1) &&
    program.definitionScopes.all fun scope =>
      (program.definitionScopes.filter fun candidate =>
        decide (candidate.originElementId = scope.originElementId)).length = 1

def exactLiveOccurrence (state : RuntimeState) (id : ScopeOccurrenceId) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = id)).length = 1

private def hostingRoot (program : Program) (instanceId : SemanticId)
    (scope : DefinitionScope) (occurrence : RuntimeScopeOccurrence) : Bool :=
  occurrence.parent.isNone &&
    occurrence.id.processInstanceId = instanceId &&
    scope.parentScopeId.isNone &&
    scope.originElementId.value = program.processId.value

private def calledRootBindingValid (state : RuntimeState)
    (scope : DefinitionScope) (occurrence : RuntimeScopeOccurrence) : Bool :=
  match state.calledProcessOccurrences.filter fun record =>
      decide (record.calledRoot = occurrence.id) with
  | [record] => record.calledProcessId.value = scope.originElementId.value
  | _ => false

private def rootAssociationValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  let hosting := hostingRoot program instanceId scope occurrence
  let called := calledRootBindingValid state scope occurrence
  (hosting && !called) || (!hosting && called)

private def runtimeParentValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (scope : DefinitionScope)
    (occurrence : RuntimeScopeOccurrence) : Bool :=
  match scope.parentScopeId, occurrence.parent with
  | none, none => rootAssociationValid program instanceId state scope occurrence
  | some definitionParent, some runtimeParent =>
      runtimeParent.processInstanceId = occurrence.id.processInstanceId &&
        runtimeParent.definitionScopeId = definitionParent &&
        exactLiveOccurrence state runtimeParent
  | _, _ => false

private def scopeOccurrenceValid (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) (occurrence : RuntimeScopeOccurrence) : Bool :=
  match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
  | none => false
  | some scope =>
      decide (occurrence.id.processInstanceId.value ≠ "") &&
        occurrence.id.activation > 0 &&
        runtimeParentValid program instanceId state scope occurrence

private def tokenBindingValid (program : Program) (state : RuntimeState)
    (token : ControlToken) : Bool :=
  match uniqueControlPlace? program token.placeId,
      controlPlaceScope? program token.placeId with
  | some _, some staticOwner =>
      staticOwner = token.owner.definitionScopeId &&
        exactLiveOccurrence state token.owner
  | _, _ => false

private def hostingRootCount (program : Program) (instanceId : SemanticId)
    (state : RuntimeState) : Nat :=
  (state.scopeOccurrences.filter fun occurrence =>
    match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
    | none => false
    | some scope => hostingRoot program instanceId scope occurrence).length

private def runningPositionValid (program : Program) (expectedInstanceId instanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  instanceId = expectedInstanceId &&
    hostingRootCount program instanceId state = 1 &&
    calledProcessAssociationsValid state &&
    (state.scopeOccurrences.all fun occurrence =>
      exactLiveOccurrence state occurrence.id &&
        scopeOccurrenceValid program instanceId state occurrence) &&
    state.tokens.all (tokenBindingValid program state)

private def lifecyclePositionValid (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted => state.scopeOccurrences.isEmpty && state.tokens.isEmpty
  | .running instanceId => runningPositionValid program expectedInstanceId instanceId state
  | .completed instanceId | .cancelled instanceId =>
      instanceId = expectedInstanceId &&
        state.scopeOccurrences.isEmpty && state.tokens.isEmpty

/-- Independent lifecycle, scope-forest, call-association, and token-binding validity. -/
def runtimePositionValid (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Bool :=
  programWellFormed program && programProjectionBindingsValid program &&
    lifecyclePositionValid program expectedInstanceId state

private theorem all_removeToken (tokens : List ControlToken) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (predicate : ControlToken → Bool)
    (holds : tokens.all predicate = true) :
    (removeToken tokens place owner).all predicate = true := by
  induction tokens with
  | nil => rfl
  | cons token rest ih =>
      simp only [List.all_cons, Bool.and_eq_true] at holds
      simp only [removeToken]
      split
      · exact holds.2
      · simp [holds.1, ih holds.2]

/-- Removing one selected token preserves the runtime position when every other read is framed. -/
theorem runtimePositionValid_removeToken_frame (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) (input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId before = true)
    (_selected : onlyTokenOwner? before input = some owner)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (callsFrame : after.calledProcessOccurrences = before.calledProcessOccurrences)
    (tokensFrame : after.tokens = removeToken before.tokens input owner) :
    runtimePositionValid program expectedInstanceId after = true := by
  have exactLiveFrame (id : ScopeOccurrenceId) :
      exactLiveOccurrence after id = exactLiveOccurrence before id := by
    simp [exactLiveOccurrence, scopesFrame]
  have scopeValidFrame (instanceId : SemanticId) (occurrence : RuntimeScopeOccurrence) :
      scopeOccurrenceValid program instanceId after occurrence =
        scopeOccurrenceValid program instanceId before occurrence := by
    simp [scopeOccurrenceValid, runtimeParentValid, rootAssociationValid,
      calledRootBindingValid, exactLiveOccurrence, scopesFrame, callsFrame]
  have tokenValidFrame (token : ControlToken) :
      tokenBindingValid program after token = tokenBindingValid program before token := by
    simp [tokenBindingValid, exactLiveOccurrence, scopesFrame]
  have rootsFrame (instanceId : SemanticId) :
      hostingRootCount program instanceId after = hostingRootCount program instanceId before := by
    simp [hostingRootCount, scopesFrame]
  have associationsFrame :
      calledProcessAssociationsValid after = calledProcessAssociationsValid before := by
    exact calledProcessAssociationsValid_frame before after controlFrame scopesFrame callsFrame
  simp only [runtimePositionValid, Bool.and_eq_true] at valid ⊢
  refine ⟨valid.1, ?_⟩
  unfold lifecyclePositionValid at valid ⊢
  rw [controlFrame]
  cases controlEq : before.control with
  | notStarted =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | completed instanceId =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | cancelled instanceId =>
      simp [controlEq, scopesFrame, tokensFrame] at valid ⊢
      exact ⟨valid.2.1, by rw [valid.2.2]; rfl⟩
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid ⊢
      obtain ⟨⟨⟨⟨identity, roots⟩, associations⟩, scopes⟩, tokens⟩ := valid.2
      refine ⟨⟨⟨⟨identity, ?_⟩, ?_⟩, ?_⟩, ?_⟩
      · rw [rootsFrame]
        exact roots
      · rw [associationsFrame]
        exact associations
      · simp only [List.all_eq_true] at scopes ⊢
        intro occurrence member
        rw [scopesFrame] at member
        have prior := scopes occurrence member
        simpa [exactLiveFrame, scopeValidFrame] using prior
      · rw [tokensFrame]
        apply all_removeToken
        rw [List.all_eq_true] at tokens ⊢
        intro token member
        rw [tokenValidFrame]
        exact tokens token member

/-- Adding one token at a projection-unique place owned by a live scope preserves the runtime
position. The caller supplies the singleton static ownership witness because this layer validates a
runtime state against an arbitrary admitted Program and does not select an operation family. -/
theorem runtimePositionValid_addToken (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) (place : ControlPlaceId) (owner : ScopeOccurrenceId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (live : exactLiveOccurrence state owner = true)
    (placeDeclared : ∃ declared, program.controlPlaces.filter (fun candidate =>
      decide (candidate.id = place)) = [declared])
    (placeOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId := owner.definitionScopeId }]) :
    runtimePositionValid program expectedInstanceId
      { state with tokens := addToken state.tokens place owner } = true := by
  let after : RuntimeState := { state with tokens := addToken state.tokens place owner }
  change runtimePositionValid program expectedInstanceId after = true
  have controlFrame : after.control = state.control := rfl
  have scopesFrame : after.scopeOccurrences = state.scopeOccurrences := rfl
  have callsFrame : after.calledProcessOccurrences = state.calledProcessOccurrences := rfl
  have exactLiveFrame (id : ScopeOccurrenceId) :
      exactLiveOccurrence after id = exactLiveOccurrence state id := by
    simp [exactLiveOccurrence, scopesFrame]
  have scopeValidFrame (instanceId : SemanticId) (occurrence : RuntimeScopeOccurrence) :
      scopeOccurrenceValid program instanceId after occurrence =
        scopeOccurrenceValid program instanceId state occurrence := by
    simp [scopeOccurrenceValid, runtimeParentValid, rootAssociationValid,
      calledRootBindingValid, exactLiveOccurrence, scopesFrame, callsFrame]
  have tokenValidFrame (token : ControlToken) :
      tokenBindingValid program after token = tokenBindingValid program state token := by
    simp [tokenBindingValid, exactLiveOccurrence, scopesFrame]
  have rootsFrame (instanceId : SemanticId) :
      hostingRootCount program instanceId after = hostingRootCount program instanceId state := by
    simp [hostingRootCount, scopesFrame]
  have associationsFrame :
      calledProcessAssociationsValid after = calledProcessAssociationsValid state := by
    exact calledProcessAssociationsValid_frame state after controlFrame scopesFrame callsFrame
  simp only [runtimePositionValid, Bool.and_eq_true] at valid ⊢
  have placeUnique : ∃ declared, uniqueControlPlace? program place = some declared := by
    obtain ⟨declared, placeSingleton⟩ := placeDeclared
    have declaredFiltered : declared ∈ program.controlPlaces.filter (fun candidate =>
        decide (candidate.id = place)) := by rw [placeSingleton]; simp
    obtain ⟨declaredMember, declaredId⟩ := List.mem_filter.mp declaredFiltered
    simp only [decide_eq_true_eq] at declaredId
    have projection := valid.1.2
    simp only [programProjectionBindingsValid, Bool.and_eq_true] at projection
    have originCount := List.all_eq_true.mp projection.1 declared declaredMember
    simp only [decide_eq_true_eq] at originCount
    obtain ⟨originPlace, originSingleton⟩ := List.length_eq_one_iff.mp originCount
    have declaredOriginMember : declared ∈ program.controlPlaces.filter (fun candidate =>
        decide (candidate.origin = declared.origin)) :=
      List.mem_filter.mpr ⟨declaredMember, by simp⟩
    rw [originSingleton] at declaredOriginMember
    have declaredEq : declared = originPlace := by simpa using declaredOriginMember
    have originEq : originPlace = declared := declaredEq.symm
    subst originPlace
    refine ⟨declared, ?_⟩
    unfold uniqueControlPlace?
    simp [placeSingleton, originSingleton]
  refine ⟨valid.1, ?_⟩
  unfold lifecyclePositionValid at valid ⊢
  rw [controlFrame]
  cases controlEq : state.control with
  | notStarted =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1] at live
      simp at live
  | completed instanceId =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1.2] at live
      simp at live
  | cancelled instanceId =>
      simp [controlEq] at valid
      unfold exactLiveOccurrence at live
      rw [valid.2.1.2] at live
      simp at live
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid ⊢
      obtain ⟨⟨⟨⟨identity, roots⟩, calls⟩, scopes⟩, tokens⟩ := valid.2
      refine ⟨⟨⟨⟨identity, ?_⟩, ?_⟩, ?_⟩, ?_⟩
      · rw [rootsFrame]
        exact roots
      · rw [associationsFrame]
        exact calls
      · simp only [List.all_eq_true] at scopes ⊢
        intro occurrence member
        rw [scopesFrame] at member
        have prior := scopes occurrence member
        simpa [exactLiveFrame, scopeValidFrame] using prior
      change (addToken state.tokens place owner).all (tokenBindingValid program after) = true
      simp only [addToken, List.all_cons, Bool.and_eq_true]
      refine ⟨?_, ?_⟩
      unfold tokenBindingValid controlPlaceScope?
      obtain ⟨declared, placeUnique⟩ := placeUnique
      rw [placeUnique, placeOwner]
      simp only [Bool.and_eq_true, decide_eq_true_eq]
      refine ⟨trivial, ?_⟩
      rw [exactLiveFrame]
      exact live
      · rw [List.all_eq_true] at tokens ⊢
        intro token member
        rw [tokenValidFrame]
        exact tokens token member

/-- Every token in a valid runtime position resolves to one projection-unique control place. -/
theorem runtimePositionValid_token_uniqueControlPlace (program : Program)
    (expectedInstanceId : SemanticId) (state : RuntimeState) (token : ControlToken)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (member : token ∈ state.tokens) :
    ∃ place, uniqueControlPlace? program token.placeId = some place := by
  simp only [runtimePositionValid, Bool.and_eq_true] at valid
  unfold lifecyclePositionValid at valid
  cases controlEq : state.control with
  | notStarted => simp [controlEq] at valid; simp_all
  | completed instanceId => simp [controlEq] at valid; simp_all
  | cancelled instanceId => simp [controlEq] at valid; simp_all
  | running instanceId =>
      simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid
      have tokenValid := List.all_eq_true.mp valid.2.2 token member
      unfold tokenBindingValid at tokenValid
      split at tokenValid <;> simp_all

/-- A selected token owner is live and equals the singleton static owner of that place. -/
theorem runtimePositionValid_onlyTokenOwner_live_and_scope (program : Program)
    (expectedInstanceId : SemanticId) (state : RuntimeState) (place : ControlPlaceId)
    (owner : ScopeOccurrenceId) (scopeId : DefinitionScopeId)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (selected : onlyTokenOwner? state place = some owner)
    (placeOwner : program.controlPlaceScopes.filter (fun ownership =>
      decide (ownership.controlPlaceId = place)) =
        [{ controlPlaceId := place, scopeId }]) :
    exactLiveOccurrence state owner = true ∧ owner.definitionScopeId = scopeId := by
  unfold onlyTokenOwner? at selected
  generalize ownersEq : tokenOwners state place = owners at selected
  cases owners with
  | nil => simp at selected
  | cons first rest =>
      cases sameOwners : rest.all (fun candidate => decide (candidate = first)) <;>
        simp [sameOwners] at selected
      have firstMember : first ∈ tokenOwners state place := by rw [ownersEq]; simp
      unfold tokenOwners at firstMember
      obtain ⟨token, tokenFiltered, tokenOwner⟩ := List.mem_map.mp firstMember
      obtain ⟨tokenMember, tokenPlace⟩ := List.mem_filter.mp tokenFiltered
      simp only [decide_eq_true_eq] at tokenPlace
      subst first
      subst owner
      subst place
      simp only [runtimePositionValid, Bool.and_eq_true] at valid
      unfold lifecyclePositionValid at valid
      cases controlEq : state.control with
      | notStarted => rw [controlEq] at valid; simp only at valid; simp_all
      | completed instanceId => rw [controlEq] at valid; simp only at valid; simp_all
      | cancelled instanceId => rw [controlEq] at valid; simp only at valid; simp_all
      | running instanceId =>
          simp only [controlEq, runningPositionValid, Bool.and_eq_true] at valid
          have tokenValid := List.all_eq_true.mp valid.2.2 token tokenMember
          unfold tokenBindingValid controlPlaceScope? at tokenValid
          rw [placeOwner] at tokenValid
          cases unique : uniqueControlPlace? program token.placeId <;> simp_all

/-- A running position over one definition scope has exactly one live scope occurrence. -/
theorem runtimePositionValid_liveOccurrence_unique_of_single_definition_scope
    (program : Program)
    (expectedInstanceId instanceId : SemanticId)
    (state : RuntimeState)
    (running : state.control = .running instanceId)
    (position : runtimePositionValid program expectedInstanceId state = true)
    (singleScope : program.definitionScopes.length = 1)
    (left right : ScopeOccurrenceId)
    (leftLive : exactLiveOccurrence state left = true)
    (rightLive : exactLiveOccurrence state right = true) :
    left = right := by
  classical
  simp only [runtimePositionValid, Bool.and_eq_true] at position
  have programValid : programWellFormed program = true := position.1.1
  have lifecycleValid := position.2
  unfold lifecyclePositionValid at lifecycleValid
  simp only [running, runningPositionValid, Bool.and_eq_true] at lifecycleValid
  obtain ⟨⟨⟨⟨_instanceIdentity, oneHostingRoot⟩, associations⟩, occurrencesValid⟩,
    _tokensValid⟩ := lifecycleValid
  obtain ⟨soleScope, scopesEq⟩ := List.length_eq_one_iff.mp singleScope

  have soleParentNone : soleScope.parentScopeId = none := by
    have forest := programWellFormed_scopeForest program programValid
    cases parentEq : soleScope.parentScopeId with
    | none => rfl
    | some parent =>
        simp [scopeForestWellFormed, scopesEq, parentEq] at forest

  have liveOccurrence (id : ScopeOccurrenceId)
      (live : exactLiveOccurrence state id = true) :
      ∃ occurrence, occurrence ∈ state.scopeOccurrences ∧ occurrence.id = id := by
    unfold exactLiveOccurrence at live
    have liveLength := of_decide_eq_true live
    obtain ⟨occurrence, singleton⟩ := List.length_eq_one_iff.mp liveLength
    have filteredMember : occurrence ∈ state.scopeOccurrences.filter (fun candidate =>
        decide (candidate.id = id)) := by
      rw [singleton]
      simp
    obtain ⟨member, identity⟩ := List.mem_filter.mp filteredMember
    simp only [decide_eq_true_eq] at identity
    exact ⟨occurrence, member, identity⟩

  have occurrenceIsRoot (occurrence : RuntimeScopeOccurrence)
      (member : occurrence ∈ state.scopeOccurrences) :
      occurrence.id.definitionScopeId = soleScope.id ∧ occurrence.parent = none := by
    have occurrenceValid := List.all_eq_true.mp occurrencesValid occurrence member
    simp only [Bool.and_eq_true] at occurrenceValid
    have scopeValid := occurrenceValid.2
    have scopeIdentity : soleScope.id = occurrence.id.definitionScopeId := by
      by_cases equal : soleScope.id = occurrence.id.definitionScopeId
      · exact equal
      · simp [scopeOccurrenceValid, uniqueDefinitionScope?, scopesEq, equal] at scopeValid
    have parentValid : runtimeParentValid program instanceId state soleScope occurrence = true := by
      simp only [scopeOccurrenceValid, uniqueDefinitionScope?, scopesEq] at scopeValid
      grind
    have parentNone : occurrence.parent = none := by
      unfold runtimeParentValid at parentValid
      rw [soleParentNone] at parentValid
      cases parentEq : occurrence.parent with
      | none => rfl
      | some parent => simp [parentEq] at parentValid
    exact ⟨scopeIdentity.symm, parentNone⟩

  have occurrenceUsesHostingInstance (occurrence : RuntimeScopeOccurrence)
      (member : occurrence ∈ state.scopeOccurrences) :
      occurrence.id.processInstanceId = instanceId := by
    obtain ⟨occurrenceScope, occurrenceParent⟩ := occurrenceIsRoot occurrence member
    by_cases sameInstance : occurrence.id.processInstanceId = instanceId
    · exact sameInstance
    ·
      let scopes := state.scopeOccurrences
      let calls := state.calledProcessOccurrences
      cases state
      cases running
      unfold calledProcessAssociationsValid at associations
      change (match some instanceId with
        | none => false
        | some _ => _) = true at associations
      simp only at associations
      generalize rootsEq : (scopes.filter fun candidate =>
        decide ((candidate.parent.isNone &&
          decide (candidate.id.processInstanceId = instanceId)) = true)) = roots at associations
      cases roots with
      | nil => simp at associations
      | cons hostingRoot rest =>
          cases rest with
          | cons other tail => simp at associations
          | nil =>
              simp only [Bool.and_eq_true, List.all_eq_true] at associations
              have rootValid := associations.1.2 occurrence member
              simp [occurrenceParent, sameInstance] at rootValid
              change (calls.filter fun candidate =>
                decide (candidate.calledRoot = occurrence.id)).length = 1 at rootValid
              obtain ⟨record, recordSingleton⟩ := List.length_eq_one_iff.mp rootValid
              have recordFilteredMember : record ∈ calls.filter (fun candidate =>
                  decide (candidate.calledRoot = occurrence.id)) := by
                rw [recordSingleton]
                simp
              obtain ⟨recordMember, calledRootIdentity⟩ :=
                List.mem_filter.mp recordFilteredMember
              simp only [decide_eq_true_eq] at calledRootIdentity
              have recordValid := associations.1.1 record recordMember
              have differentDefinitionScope :
                  record.calledRoot.definitionScopeId ≠ record.caller.definitionScopeId := by
                grind
              have callerLength :
                  (scopes.filter fun candidate =>
                    decide ((decide (candidate.id = record.caller) &&
                      candidate.parent.isNone) = true)).length = 1 := by
                grind
              obtain ⟨callerOccurrence, callerSingleton⟩ :=
                List.length_eq_one_iff.mp callerLength
              have callerFilteredMember : callerOccurrence ∈
                  scopes.filter (fun candidate =>
                    decide ((decide (candidate.id = record.caller) &&
                      candidate.parent.isNone) = true)) := by
                rw [callerSingleton]
                simp
              obtain ⟨callerMember, callerFacts⟩ := List.mem_filter.mp callerFilteredMember
              simp only [Bool.and_eq_true, decide_eq_true_eq] at callerFacts
              have callerScope := (occurrenceIsRoot callerOccurrence callerMember).1
              exfalso
              apply differentDefinitionScope
              rw [calledRootIdentity, occurrenceScope, ← callerFacts.1, callerScope]

  unfold hostingRootCount at oneHostingRoot
  have oneHostingRootLength := of_decide_eq_true oneHostingRoot
  obtain ⟨hostingOccurrence, hostingSingleton⟩ :=
    List.length_eq_one_iff.mp oneHostingRootLength
  have hostingFilteredMember : hostingOccurrence ∈
      state.scopeOccurrences.filter (fun occurrence =>
        match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
        | none => false
        | some scope => hostingRoot program instanceId scope occurrence) := by
    rw [hostingSingleton]
    simp
  obtain ⟨hostingMember, hostingAccepted⟩ := List.mem_filter.mp hostingFilteredMember
  have hostingScope := (occurrenceIsRoot hostingOccurrence hostingMember).1
  have hostingSole : hostingRoot program instanceId soleScope hostingOccurrence = true := by
    simpa [uniqueDefinitionScope?, scopesEq, hostingScope] using hostingAccepted
  have hostingOrigin : soleScope.originElementId.value = program.processId.value := by
    simp only [hostingRoot, Bool.and_eq_true] at hostingSole
    grind

  obtain ⟨leftOccurrence, leftMember, leftIdentity⟩ := liveOccurrence left leftLive
  obtain ⟨rightOccurrence, rightMember, rightIdentity⟩ := liveOccurrence right rightLive
  have hostingMemberOf (occurrence : RuntimeScopeOccurrence)
      (member : occurrence ∈ state.scopeOccurrences) :
      occurrence ∈ state.scopeOccurrences.filter (fun candidate =>
        match uniqueDefinitionScope? program candidate.id.definitionScopeId with
        | none => false
        | some scope => hostingRoot program instanceId scope candidate) := by
    obtain ⟨scopeIdentity, parentNone⟩ := occurrenceIsRoot occurrence member
    have processIdentity := occurrenceUsesHostingInstance occurrence member
    apply List.mem_filter.mpr
    refine ⟨member, ?_⟩
    simp [uniqueDefinitionScope?, scopesEq, scopeIdentity, hostingRoot, parentNone,
      processIdentity, soleParentNone, hostingOrigin]
  have leftHosting := hostingMemberOf leftOccurrence leftMember
  have rightHosting := hostingMemberOf rightOccurrence rightMember
  rw [hostingSingleton] at leftHosting rightHosting
  have occurrencesEqual : leftOccurrence = rightOccurrence := by simp_all
  exact leftIdentity.symm.trans ((congrArg RuntimeScopeOccurrence.id occurrencesEqual).trans
    rightIdentity)

end BpmnSemantics.SemanticProcess
