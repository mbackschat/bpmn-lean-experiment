import BpmnSemantics.SemanticProcess.RuntimeState
import BpmnSemantics.SemanticProcess.SimpleBooleanExpression

/-! # Structured Inclusive Gateway runtime

This module owns the occurrence-local selected-branch record and the split/join state transformations for the bounded structured Inclusive Gateway profile. Public observation deliberately excludes the record; scope completion and interruption still treat it as owned live state.
-/

namespace BpmnSemantics.SemanticProcess

private def insertPlace (place : ControlPlaceId) :
    List ControlPlaceId → List ControlPlaceId
  | [] => [place]
  | candidate :: rest =>
      if place.value < candidate.value then place :: candidate :: rest
      else candidate :: insertPlace place rest

/-- Canonical identifier order for branch provenance stored in definitions and runtime records. -/
def canonicalControlPlaceOrder : List ControlPlaceId → List ControlPlaceId
  | [] => []
  | place :: rest => insertPlace place (canonicalControlPlaceOrder rest)

private def sameSelectionOwner (owner : ScopeOccurrenceId) (key : String)
    (record : SelectedBranchSet) : Bool :=
  decide (record.owner = owner && record.selectionKey = key)

def selectionBefore (left right : SelectedBranchSet) : Bool :=
  if left.owner.processInstanceId.value ≠ right.owner.processInstanceId.value then
    left.owner.processInstanceId.value < right.owner.processInstanceId.value
  else if left.owner.definitionScopeId.value ≠
      right.owner.definitionScopeId.value then
    left.owner.definitionScopeId.value < right.owner.definitionScopeId.value
  else if left.owner.activation ≠ right.owner.activation then
    left.owner.activation < right.owner.activation
  else left.selectionKey < right.selectionKey

/-- Insert one hidden selection record in canonical occurrence/key order. -/
def insertSelectedBranchSetCanonical (record : SelectedBranchSet) :
    List SelectedBranchSet → List SelectedBranchSet
  | [] => [record]
  | current :: rest =>
      if selectionBefore record current then record :: current :: rest
      else current :: insertSelectedBranchSetCanonical record rest

/-- Evaluate every candidate against the same Process bindings, retaining all and only true candidates. -/
def evaluateTrueInclusiveCandidates (bindings : List VariableBinding) :
    List InclusiveCandidate → Option (List InclusiveCandidate)
  | [] => some []
  | candidate :: rest => do
      let selected ← evaluateTrueInclusiveCandidates bindings rest
      match ← evaluateSimpleBooleanExpression candidate.condition bindings with
      | true => pure (candidate :: selected)
      | false => pure selected

/-- Successful evaluation retains a candidate exactly when that same candidate evaluates true under the shared bindings. -/
theorem evaluated_true_candidate_membership_iff
    (bindings : List VariableBinding) (candidates selected : List InclusiveCandidate)
    (candidate : InclusiveCandidate)
    (evaluation :
      evaluateTrueInclusiveCandidates bindings candidates = some selected) :
    candidate ∈ selected ↔
      candidate ∈ candidates ∧
        evaluateSimpleBooleanExpression candidate.condition bindings =
          some true := by
  induction candidates generalizing selected with
  | nil =>
      simp [evaluateTrueInclusiveCandidates] at evaluation
      subst selected
      simp
  | cons head rest inductionHypothesis =>
      unfold evaluateTrueInclusiveCandidates at evaluation
      generalize restEq : evaluateTrueInclusiveCandidates bindings rest =
        restSelected at evaluation
      cases restSelected with
      | none => simp at evaluation
      | some restSelected =>
          generalize headEq :
            evaluateSimpleBooleanExpression head.condition bindings =
              headValue at evaluation
          cases headValue with
          | none => simp at evaluation
          | some value =>
              cases value with
              | false =>
                  simp at evaluation
                  subst selected
                  have restMembership :=
                    inductionHypothesis restSelected restEq
                  grind
              | true =>
                  simp at evaluation
                  subst selected
                  have restMembership :=
                    inductionHypothesis restSelected restEq
                  grind

/-- Produce all true branch/output pairs, or the default pair exactly when none is true. -/
def evaluateInclusiveBranches (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (bindings : List VariableBinding) :
    Option (List (ControlPlaceId × ControlPlaceId)) := do
  let selected ← evaluateTrueInclusiveCandidates bindings candidates
  if selected.isEmpty then
    pure [(defaultBranch.output, defaultBranch.expectedJoinInput)]
  else
    pure (selected.map fun candidate =>
      (candidate.output, candidate.expectedJoinInput))

/-- Under successful evaluation and a distinct default address, the default pair is selected exactly when no candidate evaluates true. -/
theorem evaluated_default_iff_no_candidate_true
    (bindings : List VariableBinding) (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (selectedCandidates : List InclusiveCandidate)
    (evaluation : evaluateTrueInclusiveCandidates bindings candidates =
      some selectedCandidates)
    (defaultDistinct : ∀ candidate ∈ candidates,
      (candidate.output, candidate.expectedJoinInput) ≠
        (defaultBranch.output, defaultBranch.expectedJoinInput)) :
    evaluateInclusiveBranches candidates defaultBranch bindings =
        some [(defaultBranch.output, defaultBranch.expectedJoinInput)] ↔
      ∀ candidate ∈ candidates,
        evaluateSimpleBooleanExpression candidate.condition bindings ≠
          some true := by
  cases selectedCandidates with
  | nil =>
      simp [evaluateInclusiveBranches, evaluation]
      intro candidate member evaluatesTrue
      have retained :=
        (evaluated_true_candidate_membership_iff bindings candidates []
          candidate evaluation).2 ⟨member, evaluatesTrue⟩
      simp at retained
  | cons head tail =>
      have headFacts :=
        (evaluated_true_candidate_membership_iff bindings candidates
          (head :: tail) head evaluation).1 (by simp)
      constructor
      · intro selectedDefault
        simp [evaluateInclusiveBranches, evaluation] at selectedDefault
        cases tail with
        | nil =>
            have samePair :
                (head.output, head.expectedJoinInput) =
                  (defaultBranch.output,
                    defaultBranch.expectedJoinInput) := by
              exact Prod.ext selectedDefault.1.1 selectedDefault.1.2
            exact False.elim ((defaultDistinct head headFacts.1) samePair)
        | cons next remaining => simp at selectedDefault
      · intro noTrue
        exact False.elim ((noTrue head headFacts.1) headFacts.2)

/-- With distinct branch addresses, a candidate's output pair occurs in the successful selection exactly when that candidate evaluates true. -/
theorem evaluated_candidate_output_membership_iff
    (bindings : List VariableBinding) (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch)
    (selectedCandidates : List InclusiveCandidate)
    (selected : List (ControlPlaceId × ControlPlaceId))
    (candidate : InclusiveCandidate)
    (candidateMember : candidate ∈ candidates)
    (addressesInjective : ∀ left ∈ candidates, ∀ right ∈ candidates,
      (left.output, left.expectedJoinInput) =
          (right.output, right.expectedJoinInput) → left = right)
    (defaultDistinct : ∀ item ∈ candidates,
      (item.output, item.expectedJoinInput) ≠
        (defaultBranch.output, defaultBranch.expectedJoinInput))
    (candidateEvaluation : evaluateTrueInclusiveCandidates bindings candidates =
      some selectedCandidates)
    (branchEvaluation : evaluateInclusiveBranches candidates defaultBranch
      bindings = some selected) :
    (candidate.output, candidate.expectedJoinInput) ∈ selected ↔
      evaluateSimpleBooleanExpression candidate.condition bindings =
        some true := by
  cases selectedCandidates with
  | nil =>
      simp [evaluateInclusiveBranches, candidateEvaluation] at branchEvaluation
      subst selected
      constructor
      · intro selectedDefault
        have samePair :
            (candidate.output, candidate.expectedJoinInput) =
              (defaultBranch.output, defaultBranch.expectedJoinInput) := by
          simpa using selectedDefault
        exact False.elim ((defaultDistinct candidate candidateMember) samePair)
      · intro evaluatesTrue
        have retained :=
          (evaluated_true_candidate_membership_iff bindings candidates []
            candidate candidateEvaluation).2 ⟨candidateMember, evaluatesTrue⟩
        simp at retained
  | cons head tail =>
      simp [evaluateInclusiveBranches, candidateEvaluation] at branchEvaluation
      subst selected
      constructor
      · intro selectedOutput
        change (candidate.output, candidate.expectedJoinInput) ∈
          List.map (fun item : InclusiveCandidate =>
            (item.output, item.expectedJoinInput)) (head :: tail) at selectedOutput
        obtain ⟨selectedCandidate, selectedMember, samePair⟩ :=
          List.mem_map.mp selectedOutput
        have selectedFacts :=
          (evaluated_true_candidate_membership_iff bindings candidates
            (head :: tail) selectedCandidate candidateEvaluation).1
            selectedMember
        have sameCandidate := addressesInjective candidate candidateMember
          selectedCandidate selectedFacts.1 samePair.symm
        simpa [sameCandidate] using selectedFacts.2
      · intro evaluatesTrue
        have selectedMember :=
          (evaluated_true_candidate_membership_iff bindings candidates
            (head :: tail) candidate candidateEvaluation).2
            ⟨candidateMember, evaluatesTrue⟩
        change (candidate.output, candidate.expectedJoinInput) ∈
          List.map (fun item : InclusiveCandidate =>
            (item.output, item.expectedJoinInput)) (head :: tail)
        exact List.mem_map.mpr ⟨candidate, selectedMember, rfl⟩

def selectManyState? (state : RuntimeState) (input : ControlPlaceId)
    (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch) (selectionKey : String) :
    Option RuntimeState :=
  match onlyTokenOwner? state input with
  | none => none
  | some owner =>
      if state.selectedBranchSets.any
          (sameSelectionOwner owner selectionKey) then none
      else
        match evaluateInclusiveBranches candidates defaultBranch
            state.variables.process.bindings with
        | none => none
        | some selected =>
            if selected.isEmpty then none
            else
              some
                { state with
                  tokens := addTokens
                    (removeToken state.tokens input owner)
                    (selected.map (·.1)) owner
                  selectedBranchSets := insertSelectedBranchSetCanonical
                    { owner
                      selectionKey
                      expectedInputs :=
                        canonicalControlPlaceOrder (selected.map (·.2)) }
                    state.selectedBranchSets }

/-- One selected record is ready only when every expected input has a token owned by that same occurrence. -/
def selectedInputOwnedReady (state : RuntimeState) (owner : ScopeOccurrenceId)
    (input : ControlPlaceId) : Bool :=
  (state.tokens.filter fun token =>
    decide (token.placeId = input && token.owner = owner)).length > 0

def selectedBranchJoinReady (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) : Bool :=
  decide (record.selectionKey = selectionKey) &&
    record.expectedInputs.all (selectedInputOwnedReady state record.owner)

def synchronizeSelectedState? (state : RuntimeState)
    (output : ControlPlaceId) (selectionKey : String) : Option RuntimeState :=
  match state.selectedBranchSets.filter
      (selectedBranchJoinReady state selectionKey) with
  | [record] =>
      some
        { state with
          tokens := addToken
            (removeTokens state.tokens record.expectedInputs record.owner)
            output record.owner
          selectedBranchSets := state.selectedBranchSets.erase record }
  | _ => none

/-- Declarative selected-branch split relation with explicit ownership, evaluation, freshness, and state-update premises. -/
inductive SelectManyStep : RuntimeState → ControlPlaceId →
    List InclusiveCandidate → InclusiveDefaultBranch → String →
    RuntimeState → Prop where
  | permitted before input candidates defaultBranch selectionKey owner selected
      (owned : onlyTokenOwner? before input = some owner)
      (fresh : before.selectedBranchSets.any
        (sameSelectionOwner owner selectionKey) = false)
      (evaluated : evaluateInclusiveBranches candidates defaultBranch
        before.variables.process.bindings = some selected)
      (nonempty : selected.isEmpty = false) :
      SelectManyStep before input candidates defaultBranch selectionKey
        { before with
          tokens := addTokens
            (removeToken before.tokens input owner) (selected.map (·.1)) owner
          selectedBranchSets := insertSelectedBranchSetCanonical
            { owner
              selectionKey
              expectedInputs :=
                canonicalControlPlaceOrder (selected.map (·.2)) }
            before.selectedBranchSets }

/-- Declarative selected-branch synchronization relation with explicit unique readiness and exact consumption. -/
inductive SynchronizeSelectedStep : RuntimeState → ControlPlaceId → String →
    RuntimeState → Prop where
  | permitted before output selectionKey record
      (present : record ∈ before.selectedBranchSets)
      (keyMatches : record.selectionKey = selectionKey)
      (ownedInputsReady : record.expectedInputs.all
        (selectedInputOwnedReady before record.owner) = true)
      (uniqueReady : before.selectedBranchSets.filter
        (selectedBranchJoinReady before selectionKey) = [record]) :
      SynchronizeSelectedStep before output selectionKey
        { before with
          tokens := addToken
            (removeTokens before.tokens record.expectedInputs record.owner)
            output record.owner
          selectedBranchSets := before.selectedBranchSets.erase record }

/-- A nonempty selected subset enables its join exactly when the key matches and every expected input has an occurrence-owned token. -/
theorem nonempty_selected_subset_join_ready_iff
    (state : RuntimeState) (selectionKey : String)
    (record : SelectedBranchSet) (_nonempty : record.expectedInputs ≠ []) :
    selectedBranchJoinReady state selectionKey record = true ↔
      record.selectionKey = selectionKey ∧
        ∀ input ∈ record.expectedInputs,
          selectedInputOwnedReady state record.owner input = true := by
  simp [selectedBranchJoinReady]

/-- Every permitted selected join consumes exactly its recorded inputs and removes exactly that record before emitting the continuation token. -/
theorem synchronize_selected_exact_consumption_and_record_removal
    (before after : RuntimeState) (output : ControlPlaceId)
    (selectionKey : String)
    (transition : SynchronizeSelectedStep before output selectionKey after) :
    ∃ record,
      record ∈ before.selectedBranchSets ∧
        record.selectionKey = selectionKey ∧
        after.tokens = addToken
          (removeTokens before.tokens record.expectedInputs record.owner)
          output record.owner ∧
        after.selectedBranchSets = before.selectedBranchSets.erase record ∧
        after =
          { before with
            tokens := addToken
              (removeTokens before.tokens record.expectedInputs record.owner)
              output record.owner
            selectedBranchSets := before.selectedBranchSets.erase record } := by
  cases transition with
  | permitted record present keyMatches _ _ =>
      exact ⟨record, present, keyMatches, rfl, rfl, rfl⟩

theorem selectManyState_sound (before after : RuntimeState)
    (input : ControlPlaceId) (candidates : List InclusiveCandidate)
    (defaultBranch : InclusiveDefaultBranch) (selectionKey : String)
    (result : selectManyState? before input candidates defaultBranch
      selectionKey = some after) :
    SelectManyStep before input candidates defaultBranch selectionKey after := by
  unfold selectManyState? at result
  generalize ownedEq : onlyTokenOwner? before input = owner? at result
  cases owner? with
  | none => simp at result
  | some owner =>
      by_cases duplicate :
          before.selectedBranchSets.any
            (sameSelectionOwner owner selectionKey) = true
      · simp [duplicate] at result
      · have fresh : before.selectedBranchSets.any
            (sameSelectionOwner owner selectionKey) = false := by
          cases value : before.selectedBranchSets.any
              (sameSelectionOwner owner selectionKey) <;> simp_all
        generalize evaluatedEq : evaluateInclusiveBranches candidates
          defaultBranch before.variables.process.bindings = selected? at result
        cases selected? with
        | none => simp [fresh] at result
        | some selected =>
            by_cases empty : selected.isEmpty = true
            · simp [fresh, empty] at result
            · have nonempty : selected.isEmpty = false := by
                cases value : selected.isEmpty <;> simp_all
              simp [fresh, nonempty] at result
              subst after
              exact .permitted before input candidates defaultBranch
                selectionKey owner selected ownedEq fresh evaluatedEq nonempty

theorem synchronizeSelectedState_sound (before after : RuntimeState)
    (output : ControlPlaceId) (selectionKey : String)
    (result : synchronizeSelectedState? before output selectionKey = some after) :
    SynchronizeSelectedStep before output selectionKey after := by
  unfold synchronizeSelectedState? at result
  generalize readyEq : before.selectedBranchSets.filter
    (selectedBranchJoinReady before selectionKey) = ready at result
  cases ready with
  | nil => simp at result
  | cons record rest =>
      cases rest with
      | cons second remaining => simp at result
      | nil =>
          simp at result
          subst after
          have filteredMembership : record ∈ before.selectedBranchSets.filter
              (selectedBranchJoinReady before selectionKey) := by
            rw [readyEq]
            simp
          simp only [List.mem_filter] at filteredMembership
          have present := filteredMembership.1
          have readiness := filteredMembership.2
          simp only [selectedBranchJoinReady, Bool.and_eq_true,
            decide_eq_true_eq] at readiness
          exact .permitted before output selectionKey record present
            readiness.1 readiness.2 readyEq

end BpmnSemantics.SemanticProcess
