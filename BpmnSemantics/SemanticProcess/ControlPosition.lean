import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.RuntimePositionValidity

/-! # Public committed control positions

This module owns the fail-closed projection from private control places and runtime scope occurrences to BPMN Sequence Flow and definition-scope origins. It also owns exact transition deltas and their revision-zero fold. No private control-place identifier enters a public position.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Public multiplicity at one BPMN Sequence Flow and runtime scope occurrence. -/
structure PublicControlTokenPosition where
  sequenceFlowId : SequenceFlowId
  owner : ScopeOccurrenceId
  multiplicity : Nat
  deriving Repr, DecidableEq

/-- Public identity and parentage of one live runtime definition-scope occurrence. -/
structure PublicScopePosition where
  id : ScopeOccurrenceId
  parent : Option ScopeOccurrenceId
  bpmnElementId : NodeId
  deriving Repr, DecidableEq

/-- Complete public control position, independently projected from one RuntimeState. -/
structure PublicControlPosition where
  controlTokens : List PublicControlTokenPosition
  scopes : List PublicScopePosition
  deriving Repr, DecidableEq

/-- Exact public position change across one semantic transition. -/
structure PublicControlPositionDelta where
  consumedTokens : List PublicControlTokenPosition
  producedTokens : List PublicControlTokenPosition
  enteredScopes : List PublicScopePosition
  exitedScopes : List PublicScopePosition
  deriving Repr, DecidableEq

def emptyPublicControlPosition : PublicControlPosition :=
  { controlTokens := [], scopes := [] }

def sameTokenPosition (left right : PublicControlTokenPosition) : Bool :=
  decide (left.sequenceFlowId = right.sequenceFlowId && left.owner = right.owner)

def tokenPositionBefore (left right : PublicControlTokenPosition) : Bool :=
  if left.sequenceFlowId.value ≠ right.sequenceFlowId.value then
    left.sequenceFlowId.value < right.sequenceFlowId.value
  else if left.owner.processInstanceId.value ≠ right.owner.processInstanceId.value then
    left.owner.processInstanceId.value < right.owner.processInstanceId.value
  else if left.owner.definitionScopeId.value ≠ right.owner.definitionScopeId.value then
    left.owner.definitionScopeId.value < right.owner.definitionScopeId.value
  else left.owner.activation < right.owner.activation

private theorem sequenceFlowId_eq_of_value_eq (left right : SequenceFlowId)
    (equal : left.value = right.value) : left = right := by cases left; cases right; congr

private theorem semanticId_eq_of_value_eq (left right : SemanticId)
    (equal : left.value = right.value) : left = right := by cases left; cases right; congr

private theorem definitionScopeId_eq_of_value_eq (left right : DefinitionScopeId)
    (equal : left.value = right.value) : left = right := by cases left; cases right; congr

private theorem scopeOccurrenceId_eq_of_fields (left right : ScopeOccurrenceId)
    (process : left.processInstanceId.value = right.processInstanceId.value)
    (scope : left.definitionScopeId.value = right.definitionScopeId.value)
    (activation : left.activation = right.activation) : left = right := by
  cases left; cases right
  simp only [ScopeOccurrenceId.mk.injEq]
  exact ⟨semanticId_eq_of_value_eq _ _ process, definitionScopeId_eq_of_value_eq _ _ scope,
    activation⟩

private theorem tokenPositionBefore_chain (left right : PublicControlTokenPosition) :
    tokenPositionBefore left right =
      armingLexStep left.sequenceFlowId.value right.sequenceFlowId.value
        (armingLexStep left.owner.processInstanceId.value right.owner.processInstanceId.value
          (armingLexStep left.owner.definitionScopeId.value right.owner.definitionScopeId.value
            (decide (left.owner.activation < right.owner.activation)))) := rfl

theorem tokenPositionBefore_asymm (left right : PublicControlTokenPosition) :
    tokenPositionBefore left right = true → tokenPositionBefore right left = false := by
  rw [tokenPositionBefore_chain, tokenPositionBefore_chain]
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  apply armingLexStep_asymm (fun _ _ => String.lt_asymm)
  simp only [decide_eq_true_eq, decide_eq_false_iff_not]
  exact Nat.lt_asymm

theorem tokenPositionBefore_trans (left middle right : PublicControlTokenPosition) :
    tokenPositionBefore left middle = true → tokenPositionBefore middle right = true →
      tokenPositionBefore left right = true := by
  rw [tokenPositionBefore_chain, tokenPositionBefore_chain, tokenPositionBefore_chain]
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  apply armingLexStep_trans (fun _ _ => String.lt_asymm) (fun _ _ _ => String.lt_trans)
  simp only [decide_eq_true_eq]
  exact Nat.lt_trans

private theorem tokenPositionBefore_comparable (left right : PublicControlTokenPosition)
    (different : left.sequenceFlowId ≠ right.sequenceFlowId ∨ left.owner ≠ right.owner) :
    tokenPositionBefore left right = true ∨ tokenPositionBefore right left = true := by
  have stringTotal (a b : String) : a ≠ b → a < b ∨ b < a := by
    intro different
    by_cases before : a < b
    · exact Or.inl before
    · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))
  have natTotal (a b : Nat) : a ≠ b → a < b ∨ b < a := by omega
  by_cases flowSame : left.sequenceFlowId.value = right.sequenceFlowId.value
  · by_cases processSame : left.owner.processInstanceId.value = right.owner.processInstanceId.value
    · by_cases scopeSame : left.owner.definitionScopeId.value = right.owner.definitionScopeId.value
      · have activationDifferent : left.owner.activation ≠ right.owner.activation := by
          intro activationSame
          have flowIdSame := sequenceFlowId_eq_of_value_eq _ _ flowSame
          have ownerSame := scopeOccurrenceId_eq_of_fields _ _ processSame scopeSame activationSame
          rcases different with flowDifferent | ownerDifferent
          · exact flowDifferent flowIdSame
          · exact ownerDifferent ownerSame
        rcases natTotal _ _ activationDifferent with before | after
        · exact Or.inl (by simp [tokenPositionBefore, flowSame, processSame, scopeSame, before])
        · exact Or.inr (by simp [tokenPositionBefore, flowSame.symm, processSame.symm,
            scopeSame.symm, after])
      · rcases stringTotal _ _ scopeSame with before | after
        · exact Or.inl (by simp [tokenPositionBefore, flowSame, processSame, scopeSame, before])
        · exact Or.inr (by simp [tokenPositionBefore, flowSame.symm, processSame.symm,
            Ne.symm scopeSame, after])
    · rcases stringTotal _ _ processSame with before | after
      · exact Or.inl (by simp [tokenPositionBefore, flowSame, processSame, before])
      · exact Or.inr (by simp [tokenPositionBefore, flowSame.symm, Ne.symm processSame, after])
  · rcases stringTotal _ _ flowSame with before | after
    · exact Or.inl (by simp [tokenPositionBefore, flowSame, before])
    · exact Or.inr (by simp [tokenPositionBefore, Ne.symm flowSame, after])

def tokenPositionKey (position : PublicControlTokenPosition) :
    SequenceFlowId × ScopeOccurrenceId :=
  (position.sequenceFlowId, position.owner)

theorem sameTokenPosition_iff_key_eq (left right : PublicControlTokenPosition) :
    sameTokenPosition left right = true ↔ tokenPositionKey left = tokenPositionKey right := by
  simp [sameTokenPosition, tokenPositionKey]

def insertTokenPosition (position : PublicControlTokenPosition) :
    List PublicControlTokenPosition → List PublicControlTokenPosition
  | [] => [position]
  | current :: rest =>
      if sameTokenPosition position current then
        { current with multiplicity := current.multiplicity + position.multiplicity } :: rest
      else if tokenPositionBefore position current then position :: current :: rest
      else current :: insertTokenPosition position rest

theorem tokenPositionKey_mem_insert (key : SequenceFlowId × ScopeOccurrenceId)
    (position : PublicControlTokenPosition) (positions : List PublicControlTokenPosition) :
    key ∈ (insertTokenPosition position positions).map tokenPositionKey ↔
      key = tokenPositionKey position ∨ key ∈ positions.map tokenPositionKey := by
  induction positions with
  | nil => simp [insertTokenPosition]
  | cons current rest ih =>
      by_cases same : sameTokenPosition position current = true
      · have keyEq := (sameTokenPosition_iff_key_eq position current).mp same
        simp only [insertTokenPosition, same, if_pos, List.map_cons, List.mem_cons]
        simp only [tokenPositionKey] at keyEq ⊢
        rw [keyEq]
        simp
      · by_cases before : tokenPositionBefore position current = true
        · simp [insertTokenPosition, same, before]
        · simp [insertTokenPosition, same, before, ih, or_left_comm]

theorem tokenPositionBefore_key_congr (left left' right right' : PublicControlTokenPosition)
    (leftKey : tokenPositionKey left = tokenPositionKey left')
    (rightKey : tokenPositionKey right = tokenPositionKey right') :
    tokenPositionBefore left right = tokenPositionBefore left' right' := by
  cases left; cases left'; cases right; cases right'
  simp only [tokenPositionKey, Prod.mk.injEq] at leftKey rightKey
  simp_all [tokenPositionBefore]

theorem tokenPositionBefore_comparable_of_key_ne
    (left right : PublicControlTokenPosition)
    (different : tokenPositionKey left ≠ tokenPositionKey right) :
    tokenPositionBefore left right = true ∨ tokenPositionBefore right left = true := by
  apply tokenPositionBefore_comparable
  by_cases flowDifferent : left.sequenceFlowId ≠ right.sequenceFlowId
  · exact Or.inl flowDifferent
  · exact Or.inr (by
      intro ownerSame
      apply different
      have flowSame : left.sequenceFlowId = right.sequenceFlowId := by
        by_cases same : left.sequenceFlowId = right.sequenceFlowId
        · exact same
        · exact False.elim (flowDifferent same)
      apply Prod.ext
      · exact flowSame
      · exact ownerSame)

def tokenPositionsStrict : List PublicControlTokenPosition → Prop
  | [] => True
  | current :: rest =>
      (∀ candidate ∈ rest, tokenPositionBefore current candidate = true) ∧
        tokenPositionsStrict rest

theorem tokenPositionsStrict_insert (position : PublicControlTokenPosition) :
    ∀ positions, tokenPositionsStrict positions →
      tokenPositionsStrict (insertTokenPosition position positions) := by
  intro positions
  induction positions with
  | nil => simp [tokenPositionsStrict, insertTokenPosition]
  | cons current rest ih =>
      intro strict
      obtain ⟨currentBefore, restStrict⟩ := strict
      by_cases same : sameTokenPosition position current = true
      · simp only [insertTokenPosition, same, if_pos, tokenPositionsStrict]
        exact ⟨by
          intro candidate member
          simpa [tokenPositionBefore] using currentBefore candidate member, restStrict⟩
      · by_cases before : tokenPositionBefore position current = true
        · simp only [insertTokenPosition, same, before, if_true]
          exact ⟨by
            intro candidate member
            rcases List.mem_cons.mp member with rfl | member
            · exact before
            · exact tokenPositionBefore_trans position current candidate before
                (currentBefore candidate member), ⟨currentBefore, restStrict⟩⟩
        · simp only [insertTokenPosition, same, before]
          refine ⟨?_, ih restStrict⟩
          intro candidate member
          have keyMember := (tokenPositionKey_mem_insert (tokenPositionKey candidate)
            position rest).mp (List.mem_map.mpr ⟨candidate, member, rfl⟩)
          rcases keyMember with candidateKey | existingKey
          · have keyDifferent : tokenPositionKey position ≠ tokenPositionKey current := by
              exact fun equal => same ((sameTokenPosition_iff_key_eq position current).mpr equal)
            have currentBeforePosition :=
              (tokenPositionBefore_comparable_of_key_ne position current keyDifferent).resolve_left before
            exact Eq.trans (tokenPositionBefore_key_congr current current candidate position rfl
              candidateKey) currentBeforePosition
          · obtain ⟨existing, existingMember, existingKey⟩ := List.mem_map.mp existingKey
            exact Eq.trans (tokenPositionBefore_key_congr current current candidate existing rfl
              existingKey.symm) (currentBefore existing existingMember)

private def scopePositionBefore (left right : PublicScopePosition) : Bool :=
  if left.id.processInstanceId.value ≠ right.id.processInstanceId.value then
    left.id.processInstanceId.value < right.id.processInstanceId.value
  else if left.id.definitionScopeId.value ≠ right.id.definitionScopeId.value then
    left.id.definitionScopeId.value < right.id.definitionScopeId.value
  else left.id.activation < right.id.activation

private def insertScopePosition? (position : PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => some [position]
  | current :: rest =>
      if position.id = current.id then none
      else if scopePositionBefore position current then some (position :: current :: rest)
      else do pure (current :: (← insertScopePosition? position rest))

def tokenOrigin (program : Program) (token : ControlToken) : SequenceFlowId :=
  match uniqueControlPlace? program token.placeId with
  | some place => place.origin.elementId
  | none => ⟨""⟩

def projectTokens (program : Program) :
    List ControlToken → List PublicControlTokenPosition
  | [] => []
  | token :: rest =>
      insertTokenPosition
        { sequenceFlowId := tokenOrigin program token
          owner := token.owner
          multiplicity := 1 }
        (projectTokens program rest)

theorem projectTokens_strict (program : Program) (tokens : List ControlToken) :
    tokenPositionsStrict (projectTokens program tokens) := by
  induction tokens with
  | nil => trivial
  | cons token rest ih => exact tokenPositionsStrict_insert _ _ ih

private theorem tokenPositionsStrict_keys_nodup (positions : List PublicControlTokenPosition)
    (strict : tokenPositionsStrict positions) : (positions.map tokenPositionKey).Nodup := by
  induction positions with
  | nil => simp
  | cons current rest ih =>
      obtain ⟨currentBefore, restStrict⟩ := strict
      simp only [List.map_cons, List.nodup_cons]
      refine ⟨?_, ih restStrict⟩
      intro member
      obtain ⟨candidate, candidateMember, candidateKey⟩ := List.mem_map.mp member
      have before := currentBefore candidate candidateMember
      rw [tokenPositionBefore_key_congr current current candidate current rfl candidateKey] at before
      have after := tokenPositionBefore_asymm current current before
      rw [after] at before
      contradiction

private def scopeOrigin (program : Program)
    (occurrence : RuntimeScopeOccurrence) : NodeId :=
  match uniqueDefinitionScope? program occurrence.id.definitionScopeId with
  | some scope => scope.originElementId
  | none => ⟨""⟩

private def insertProjectedScopePosition (position : PublicScopePosition) :
    List PublicScopePosition → List PublicScopePosition
  | [] => [position]
  | current :: rest =>
      if scopePositionBefore position current then position :: current :: rest
      else current :: insertProjectedScopePosition position rest

def projectScopes (program : Program) :
    List RuntimeScopeOccurrence → List PublicScopePosition
  | [] => []
  | occurrence :: rest =>
      insertProjectedScopePosition
        { id := occurrence.id
          parent := occurrence.parent
          bpmnElementId := scopeOrigin program occurrence }
        (projectScopes program rest)

/-- Project exact public positions, rejecting malformed Program bindings and runtime ownership. -/
def projectControlPosition? (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Option PublicControlPosition :=
  if runtimePositionValid program expectedInstanceId state then
    some
      { controlTokens := projectTokens program state.tokens
        scopes := projectScopes program state.scopeOccurrences }
  else none

/-- Explicit validity hypotheses under which the private-to-public projection is total. -/
def controlPositionProjectable (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) : Prop :=
  runtimePositionValid program expectedInstanceId state = true

/-- Every admitted, binding-valid runtime position has one exact public projection. -/
theorem projectControlPosition_total (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState)
    (valid : controlPositionProjectable program expectedInstanceId state) :
    ∃ position, projectControlPosition? program expectedInstanceId state = some position := by
  let position : PublicControlPosition :=
    { controlTokens := projectTokens program state.tokens
      scopes := projectScopes program state.scopeOccurrences }
  have validity : runtimePositionValid program expectedInstanceId state = true := valid
  refine ⟨position, ?_⟩
  simp [projectControlPosition?, validity, position]

def tokenMultiplicityAt (positions : List PublicControlTokenPosition)
    (target : PublicControlTokenPosition) : Nat :=
  match positions.find? (sameTokenPosition target) with
  | some position => position.multiplicity
  | none => 0

theorem tokenMultiplicityAt_of_mem (positions : List PublicControlTokenPosition)
    (position : PublicControlTokenPosition) (strict : tokenPositionsStrict positions)
    (member : position ∈ positions) :
    tokenMultiplicityAt positions position = position.multiplicity := by
  have nodup := tokenPositionsStrict_keys_nodup positions strict
  induction positions with
  | nil => simp at member
  | cons current rest ih =>
      simp only [List.map_cons, List.nodup_cons] at nodup
      rcases List.mem_cons.mp member with rfl | member
      · simp [tokenMultiplicityAt, sameTokenPosition]
      · have different : sameTokenPosition position current = false := by
          apply Bool.eq_false_iff.mpr
          intro same
          apply nodup.1
          have keyEq := (sameTokenPosition_iff_key_eq position current).mp same
          rw [← keyEq]
          exact List.mem_map.mpr ⟨position, member, rfl⟩
        simp only [tokenMultiplicityAt, List.find?_cons, different]
        exact ih strict.2 member nodup.2

def tokenDifference (left right : List PublicControlTokenPosition) :
    List PublicControlTokenPosition :=
  left.filterMap fun position =>
    let multiplicity := position.multiplicity - tokenMultiplicityAt right position
    if multiplicity = 0 then none else some { position with multiplicity }

def scopeDifference (left right : List PublicScopePosition) :
    List PublicScopePosition :=
  left.filter fun position => !(right.any fun candidate => candidate == position)

/-- Compute one exact delta from independently projected before and after states. -/
def controlPositionDelta? (program : Program) (expectedInstanceId : SemanticId)
    (before after : RuntimeState) : Option PublicControlPositionDelta := do
  let beforePosition ← projectControlPosition? program expectedInstanceId before
  let afterPosition ← projectControlPosition? program expectedInstanceId after
  pure
    { consumedTokens := tokenDifference beforePosition.controlTokens afterPosition.controlTokens
      producedTokens := tokenDifference afterPosition.controlTokens beforePosition.controlTokens
      enteredScopes := scopeDifference afterPosition.scopes beforePosition.scopes
      exitedScopes := scopeDifference beforePosition.scopes afterPosition.scopes }

private def consumeTokenPosition? (consumed : PublicControlTokenPosition) :
    List PublicControlTokenPosition → Option (List PublicControlTokenPosition)
  | [] => none
  | current :: rest =>
      if sameTokenPosition consumed current then
        if consumed.multiplicity = 0 || consumed.multiplicity > current.multiplicity then none
        else if consumed.multiplicity = current.multiplicity then some rest
        else some ({ current with multiplicity := current.multiplicity - consumed.multiplicity } :: rest)
      else do pure (current :: (← consumeTokenPosition? consumed rest))

private def consumeTokenPositions? :
    List PublicControlTokenPosition → List PublicControlTokenPosition →
      Option (List PublicControlTokenPosition)
  | current, [] => some current
  | current, consumed :: rest => do
      consumeTokenPositions? (← consumeTokenPosition? consumed current) rest

private def produceTokenPositions? (current : List PublicControlTokenPosition) :
    List PublicControlTokenPosition → Option (List PublicControlTokenPosition)
  | [] => some current
  | produced :: rest =>
      if produced.multiplicity = 0 then none
      else produceTokenPositions? (insertTokenPosition produced current) rest

private def exitScopePosition? (exited : PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => none
  | current :: rest =>
      if current = exited then some rest
      else do pure (current :: (← exitScopePosition? exited rest))

private def exitScopePositions? :
    List PublicScopePosition → List PublicScopePosition → Option (List PublicScopePosition)
  | current, [] => some current
  | current, exited :: rest => do
      exitScopePositions? (← exitScopePosition? exited current) rest

private def enterScopePositions? (current : List PublicScopePosition) :
    List PublicScopePosition → Option (List PublicScopePosition)
  | [] => some current
  | entered :: rest => do
      enterScopePositions? (← insertScopePosition? entered current) rest

/-- Apply one fail-closed exact position delta. -/
def applyControlPositionDelta? (current : PublicControlPosition)
    (delta : PublicControlPositionDelta) : Option PublicControlPosition := do
  let remainingTokens ← consumeTokenPositions? current.controlTokens delta.consumedTokens
  let nextTokens ← produceTokenPositions? remainingTokens delta.producedTokens
  let remainingScopes ← exitScopePositions? current.scopes delta.exitedScopes
  let nextScopes ← enterScopePositions? remainingScopes delta.enteredScopes
  pure { controlTokens := nextTokens, scopes := nextScopes }

def foldControlPositionDeltas :
    PublicControlPosition → List PublicControlPositionDelta → Option PublicControlPosition
  | position, [] => some position
  | position, delta :: rest => do
      foldControlPositionDeltas (← applyControlPositionDelta? position delta) rest

private structure DeltaTraceAccumulator where
  state : RuntimeState
  deltas : List PublicControlPositionDelta

private def replayOneTransition? (program : Program) (state : RuntimeState) :
    CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus =>
      let admission := admitStimulus program state stimulus
      if admission.outcome = .committed then some admission.state else none
  | .internalOperation record => replayInternalTransition? program state record

private def buildPositionDeltas? (program : Program) (expectedInstanceId : SemanticId) :
    RuntimeState → List CommittedTransition → Option DeltaTraceAccumulator
  | state, [] => some { state, deltas := [] }
  | state, transition :: rest => do
      let successor ← replayOneTransition? program state transition
      let delta ← controlPositionDelta? program expectedInstanceId state successor
      let tail ← buildPositionDeltas? program expectedInstanceId successor rest
      pure { state := tail.state, deltas := delta :: tail.deltas }

private def foldCheckedDeltas (current : PublicControlPosition) :
    List PublicControlPositionDelta → Option (List PublicControlPositionDelta)
  | deltas =>
      if foldControlPositionDeltas emptyPublicControlPosition deltas = some current then
        some deltas
      else none

/-- Replay a trace only to prove each exact before/after delta and its independent head projection. -/
def traceControlPositionDeltas? (program : Program) (expectedInstanceId : SemanticId)
    (initial : RuntimeState) (transitions : List CommittedTransition) :
    Option (List PublicControlPositionDelta × PublicControlPosition) := do
  let initialPosition ← projectControlPosition? program expectedInstanceId initial
  if initialPosition ≠ emptyPublicControlPosition then none
  else
    let traced ← buildPositionDeltas? program expectedInstanceId initial transitions
    let current ← projectControlPosition? program expectedInstanceId traced.state
    let deltas ← foldCheckedDeltas current traced.deltas
    pure (deltas, current)

/-- Every accepted delta list folds from revision zero to the independently projected head. -/
theorem foldCheckedDeltas_reconstructs_current (current : PublicControlPosition)
    (candidate accepted : List PublicControlPositionDelta)
    (result : foldCheckedDeltas current candidate = some accepted) :
    foldControlPositionDeltas emptyPublicControlPosition accepted = some current := by
  unfold foldCheckedDeltas at result
  dsimp only at result
  split at result <;> simp_all

/-- Every successfully emitted delta trace folds to the same independently projected head it returns. -/
theorem traceControlPositionDeltas_reconstructs_head (program : Program)
    (expectedInstanceId : SemanticId) (initial : RuntimeState)
    (transitions : List CommittedTransition)
    (deltas : List PublicControlPositionDelta) (current : PublicControlPosition)
    (result : traceControlPositionDeltas? program expectedInstanceId initial transitions =
      some (deltas, current)) :
    foldControlPositionDeltas emptyPublicControlPosition deltas = some current := by
  unfold traceControlPositionDeltas? at result
  generalize initialProjectionEq :
    projectControlPosition? program expectedInstanceId initial = initialProjection at result
  cases initialProjection with
  | none => simp at result
  | some initialPosition =>
      by_cases nonempty : initialPosition ≠ emptyPublicControlPosition
      · simp [nonempty] at result
      · simp at result
        rcases result with ⟨_initialEmpty, result⟩
        generalize tracedEq :
          buildPositionDeltas? program expectedInstanceId initial transitions = traced at result
        cases traced with
        | none => simp at result
        | some traced =>
            generalize currentEq :
              projectControlPosition? program expectedInstanceId traced.state = projected at result
            cases projected with
            | none => simp [currentEq] at result
            | some projected =>
                simp [currentEq] at result
                generalize deltasEq : foldCheckedDeltas projected traced.deltas = accepted at result
                cases accepted with
                | none => simp at result
                | some accepted =>
                    simp at result
                    rcases result with ⟨rfl, rfl⟩
                    exact foldCheckedDeltas_reconstructs_current projected traced.deltas accepted deltasEq

end BpmnSemantics.SemanticProcess
