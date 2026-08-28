import BpmnSemantics.SemanticProcess.ControlPositionDeltaProofs
import BpmnSemantics.SemanticProcess.InternalCommutationTransitionRecord

/-! # Internal commutation publication

This module proves that the exact accepted transition, lifecycle, logical-time, and public-position records of a classified pair are independent of execution order before canonical pair numbering.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics
open InternalCommutation

/-- Internal evidence bundle. This is a proof representation and adds no public wire field. -/
structure AcceptedInternalPublicationPair where
  pair : InternalPublicationPair
  logicalTimeMs : Nat
  positionDelta : PublicControlPositionDelta

structure NumberedInternalPublicationPair where
  transitionIndex : Nat
  publication : AcceptedInternalPublicationPair

private def acceptedPairBefore (left right : AcceptedInternalPublicationPair) : Bool :=
  publicationPairBefore left.pair right.pair

private def insertAcceptedPair (pair : AcceptedInternalPublicationPair) :
    List AcceptedInternalPublicationPair → List AcceptedInternalPublicationPair
  | [] => [pair]
  | current :: rest =>
      if acceptedPairBefore pair current then pair :: current :: rest
      else current :: insertAcceptedPair pair rest

def canonicalAcceptedInternalPublicationPairs :
    List AcceptedInternalPublicationPair → List AcceptedInternalPublicationPair
  | [] => []
  | pair :: rest => insertAcceptedPair pair (canonicalAcceptedInternalPublicationPairs rest)

def numberInternalPublicationPairs :
    Nat → List AcceptedInternalPublicationPair → List NumberedInternalPublicationPair
  | _, [] => []
  | transitionIndex, pair :: rest =>
      { transitionIndex, publication := pair } ::
        numberInternalPublicationPairs (transitionIndex + 1) rest

def acceptedInternalPublicationPair? (program : Program) (expectedInstanceId : SemanticId)
    (footprintState before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) : Option AcceptedInternalPublicationPair := do
  let pair ← internalPublicationPair? program footprintState before after operation commandId
  let positionDelta ← controlPositionDelta? program expectedInstanceId before after
  pure { pair, logicalTimeMs := before.logicalTimeMs, positionDelta }

def acceptedInternalPairPublication? (program : Program) (expectedInstanceId : SemanticId)
    (state : RuntimeState) (first second : SemanticOperation)
    (commandId : SemanticId) (firstTransitionIndex : Nat) :
    Option (RuntimeState × List NumberedInternalPublicationPair) := do
  let firstAfter ← fire? program first state
  let final ← fire? program second firstAfter
  let firstPair ← acceptedInternalPublicationPair? program expectedInstanceId
    state state firstAfter first commandId
  let secondPair ← acceptedInternalPublicationPair? program expectedInstanceId
    state firstAfter final second commandId
  let ordered := canonicalAcceptedInternalPublicationPairs [firstPair, secondPair]
  pure (final, numberInternalPublicationPairs firstTransitionIndex ordered)

private theorem runtimeStateWellFormed_position (program : Program) (instanceId : SemanticId)
    (state : RuntimeState)
    (wellFormed : runtimeStateWellFormed program instanceId state = true) :
    runtimePositionValid program instanceId state = true := by
  simp only [runtimeStateWellFormed, Bool.and_eq_true] at wellFormed
  obtain ⟨h16, _⟩ := wellFormed
  obtain ⟨h15, _⟩ := h16
  obtain ⟨h14, _⟩ := h15
  obtain ⟨h13, _⟩ := h14
  obtain ⟨h12, _⟩ := h13
  obtain ⟨h11, _⟩ := h12
  obtain ⟨h10, _⟩ := h11
  obtain ⟨h9, _⟩ := h10
  obtain ⟨h8, _⟩ := h9
  obtain ⟨h7, _⟩ := h8
  obtain ⟨h6, _⟩ := h7
  obtain ⟨h5, _⟩ := h6
  obtain ⟨h4, _⟩ := h5
  obtain ⟨h3, _⟩ := h4
  obtain ⟨h2, _⟩ := h3
  obtain ⟨h1, _⟩ := h2
  exact h1.1.1

private theorem acceptedInternalPublicationPair_prepared (program : Program)
    (expectedInstanceId commandId : SemanticId) (footprintState before : RuntimeState)
    (operation : SemanticOperation) (patch : InternalArmingPatch)
    (programAdmitted : programWellFormed program = true)
    (beforeAdmitted : runtimeStateWellFormed program expectedInstanceId before = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program before).isSome = true)
    (footprintPrepared : prepareInternalArm? program footprintState operation = some patch)
    (beforePrepared : prepareInternalArm? program before operation = some patch) :
    ∃ newStart,
      waitStart? program before patch.owner patch.write.elementId
          patch.write.occurrence.activation = some newStart ∧
      acceptedInternalPublicationPair? program expectedInstanceId footprintState before
          (applyInternalArmingPatch before patch) operation commandId =
        some
          { pair :=
              { footprint := footprintOfPatch patch
                record :=
                  { operationId := patch.operation.id
                    operationKind := patch.operation.kind
                    origin := patch.operation.origin
                    owner := patch.owner }
                lifecycle := canonicalFlowNodeOccurrenceDelta [newStart] [] }
            logicalTimeMs := before.logicalTimeMs
            positionDelta :=
              { consumedTokens :=
                  [PublicControlTokenPosition.mk patch.inputOrigin.elementId patch.owner 1]
                producedTokens := []
                enteredScopes := []
                exitedScopes := [] } } := by
  obtain ⟨newStart, started, lifecycle⟩ := prepared_arm_lifecycle_singleton program before
    operation patch expectedInstanceId commandId programAdmitted beforeAdmitted openBefore
    beforePrepared
  have record := internalTransitionRecord_prepared program before operation patch programAdmitted
    beforePrepared
  have position := runtimeStateWellFormed_position program expectedInstanceId before beforeAdmitted
  have positionDelta := controlPositionDelta_prepared_internal_arm program expectedInstanceId before
    operation patch position beforePrepared
  refine ⟨newStart, started, ?_⟩
  simp only [acceptedInternalPublicationPair?, internalPublicationPair?,
    internalTransitionFootprint?, footprintPrepared, Option.map_some]
  rw [record, lifecycle, positionDelta]
  rfl

private theorem string_total (left right : String) (different : left ≠ right) :
    left < right ∨ right < left := by
  by_cases before : left < right
  · exact Or.inl before
  · exact Or.inr (Std.lt_of_le_of_ne (by simpa using before) (Ne.symm different))

private theorem canonicalAcceptedInternalPublicationPairs_pair_commutes
    (left right : AcceptedInternalPublicationPair)
    (different : left.pair.footprint.operationId ≠ right.pair.footprint.operationId) :
    canonicalAcceptedInternalPublicationPairs [left, right] =
      canonicalAcceptedInternalPublicationPairs [right, left] := by
  have valueDifferent : left.pair.footprint.operationId.value ≠
      right.pair.footprint.operationId.value := by
    intro same
    apply different
    have leftEta : left.pair.footprint.operationId =
        ⟨left.pair.footprint.operationId.value⟩ := by
      cases left.pair.footprint.operationId
      rfl
    have rightEta : right.pair.footprint.operationId =
        ⟨right.pair.footprint.operationId.value⟩ := by
      cases right.pair.footprint.operationId
      rfl
    exact leftEta.trans ((congrArg OperationId.mk same).trans rightEta.symm)
  have forward : acceptedPairBefore left right =
      (left.pair.footprint.operationId.value < right.pair.footprint.operationId.value) := by
    simp [acceptedPairBefore, publicationPairBefore, different]
  have backward : acceptedPairBefore right left =
      (right.pair.footprint.operationId.value < left.pair.footprint.operationId.value) := by
    simp [acceptedPairBefore, publicationPairBefore, Ne.symm different]
  rcases string_total _ _ valueDifferent with before | before
  · simp [canonicalAcceptedInternalPublicationPairs, insertAcceptedPair, forward, backward,
      before, String.lt_asymm before]
  · simp [canonicalAcceptedInternalPublicationPairs, insertAcceptedPair, forward, backward,
      before, String.lt_asymm before]

/-- Both explicit orders yield one defined identical complete publication with canonical numbering. -/
theorem classified_internal_pair_publication_commutes
    (program : Program) (state : RuntimeState) (left right : SemanticOperation)
    (instanceId commandId : SemanticId) (firstTransitionIndex : Nat)
    (programAdmitted : programWellFormed program = true)
    (stateAdmitted : runtimeStateWellFormed program instanceId state = true)
    (openBefore : (projectOpenFlowNodeOccurrences? program state).isSome = true)
    (classified : internalOperationPairIndependent? program state [left, right] = true) :
    ∃ publication,
      acceptedInternalPairPublication? program instanceId state left right commandId
          firstTransitionIndex = some publication ∧
        acceptedInternalPairPublication? program instanceId state right left commandId
          firstTransitionIndex = some publication := by
  have classification := classified
  simp only [internalOperationPairIndependent?, Bool.and_eq_true] at classification
  obtain ⟨⟨⟨operationIdsDifferent, _⟩, _⟩, separated⟩ := classification
  unfold internalTransitionFootprint? at separated
  generalize leftPrepared : prepareInternalArm? program state left = leftPatch at separated
  generalize rightPrepared : prepareInternalArm? program state right = rightPatch at separated
  cases leftPatch with
  | none => simp at separated
  | some leftPatch =>
      cases rightPatch with
      | none => simp at separated
      | some rightPatch =>
          simp only [Option.map_some, Bool.and_eq_true] at separated
          have canonical := runtimeStateWellFormed_canonicalCollectionOrder program instanceId state
            stateAdmitted
          have leftPreserved := prepared_arm_preserves_runtime_and_open_set program state left
            leftPatch instanceId programAdmitted stateAdmitted openBefore leftPrepared
          have rightPreserved := prepared_arm_preserves_runtime_and_open_set program state right
            rightPatch instanceId programAdmitted stateAdmitted openBefore rightPrepared
          have rightFrame := prepared_patch_frame program state left right leftPatch rightPatch
            leftPrepared rightPrepared separated.1
          have leftFrame := prepared_patch_frame program state right left rightPatch leftPatch
            rightPrepared leftPrepared separated.2
          have patchesCommute := applyInternalArmingPatches_commute state leftPatch rightPatch
            canonical separated.1
          let leftAfter := applyInternalArmingPatch state leftPatch
          let rightAfter := applyInternalArmingPatch state rightPatch
          let final := applyInternalArmingPatch leftAfter rightPatch
          have reverseFinal : applyInternalArmingPatch rightAfter leftPatch = final := by
            simpa [leftAfter, rightAfter, final] using patchesCommute.symm
          obtain ⟨leftStart, leftStarted, leftAccepted⟩ :=
            acceptedInternalPublicationPair_prepared program instanceId commandId state state left
              leftPatch programAdmitted stateAdmitted openBefore leftPrepared leftPrepared
          obtain ⟨rightStart, rightStarted, rightAccepted⟩ :=
            acceptedInternalPublicationPair_prepared program instanceId commandId state state right
              rightPatch programAdmitted stateAdmitted openBefore rightPrepared rightPrepared
          obtain ⟨rightStartAfterLeft, rightStartedAfterLeft, rightAcceptedAfterLeft⟩ :=
            acceptedInternalPublicationPair_prepared program instanceId commandId state leftAfter
              right rightPatch programAdmitted leftPreserved.1 leftPreserved.2.1 rightPrepared
              (by simpa [leftAfter] using rightFrame)
          rw [armingWaitStart_frame program state leftPatch, rightStarted] at rightStartedAfterLeft
          cases rightStartedAfterLeft
          obtain ⟨leftStartAfterRight, leftStartedAfterRight, leftAcceptedAfterRight⟩ :=
            acceptedInternalPublicationPair_prepared program instanceId commandId state rightAfter
              left leftPatch programAdmitted rightPreserved.1 rightPreserved.2.1 leftPrepared
              (by simpa [rightAfter] using leftFrame)
          rw [armingWaitStart_frame program state rightPatch, leftStarted] at leftStartedAfterRight
          cases leftStartedAfterRight
          rw [reverseFinal] at leftAcceptedAfterRight
          let leftPublication : AcceptedInternalPublicationPair :=
            { pair :=
                { footprint := footprintOfPatch leftPatch
                  record :=
                    { operationId := leftPatch.operation.id
                      operationKind := leftPatch.operation.kind
                      origin := leftPatch.operation.origin
                      owner := leftPatch.owner }
                  lifecycle := canonicalFlowNodeOccurrenceDelta [leftStart] [] }
              logicalTimeMs := state.logicalTimeMs
              positionDelta :=
                { consumedTokens :=
                    [PublicControlTokenPosition.mk leftPatch.inputOrigin.elementId leftPatch.owner 1]
                  producedTokens := []
                  enteredScopes := []
                  exitedScopes := [] } }
          let rightPublication : AcceptedInternalPublicationPair :=
            { pair :=
                { footprint := footprintOfPatch rightPatch
                  record :=
                    { operationId := rightPatch.operation.id
                      operationKind := rightPatch.operation.kind
                      origin := rightPatch.operation.origin
                      owner := rightPatch.owner }
                  lifecycle := canonicalFlowNodeOccurrenceDelta [rightStart] [] }
              logicalTimeMs := state.logicalTimeMs
              positionDelta :=
                { consumedTokens :=
                    [PublicControlTokenPosition.mk rightPatch.inputOrigin.elementId rightPatch.owner 1]
                  producedTokens := []
                  enteredScopes := []
                  exitedScopes := [] } }
          have leftAcceptedFirst : acceptedInternalPublicationPair? program instanceId state state
              leftAfter left commandId = some leftPublication := by
            simpa [leftAfter, leftPublication] using leftAccepted
          have rightAcceptedFirst : acceptedInternalPublicationPair? program instanceId state state
              rightAfter right commandId = some rightPublication := by
            simpa [rightAfter, rightPublication] using rightAccepted
          have rightAcceptedSecond : acceptedInternalPublicationPair? program instanceId state
              leftAfter final right commandId = some rightPublication := by
            simpa [leftAfter, final, rightPublication, armingTimeRead_frame] using
              rightAcceptedAfterLeft
          have leftAcceptedSecond : acceptedInternalPublicationPair? program instanceId state
              rightAfter final left commandId = some leftPublication := by
            simpa [rightAfter, leftPublication, armingTimeRead_frame] using leftAcceptedAfterRight
          have patchIdsDifferent : leftPatch.operation.id ≠ rightPatch.operation.id := by
            simpa [prepared_operation_eq program state left leftPatch leftPrepared,
              prepared_operation_eq program state right rightPatch rightPrepared] using
              operationIdsDifferent
          have orderedEq := canonicalAcceptedInternalPublicationPairs_pair_commutes
            leftPublication rightPublication (by
              change leftPatch.operation.id ≠ rightPatch.operation.id
              exact patchIdsDifferent)
          have leftStep := prepareInternalArm_applies program state left leftPatch leftPrepared
          have rightStep := prepareInternalArm_applies program state right rightPatch rightPrepared
          have rightSecond : fire? program right (applyInternalArmingPatch state leftPatch) =
              some final := by
            simpa [leftAfter, final] using prepareInternalArm_applies program leftAfter right
              rightPatch (by simpa [leftAfter] using rightFrame)
          have leftSecond : fire? program left (applyInternalArmingPatch state rightPatch) =
              some final := by
            have fired := prepareInternalArm_applies program rightAfter left leftPatch (by
              simpa [rightAfter] using leftFrame)
            rw [reverseFinal] at fired
            simpa [rightAfter] using fired
          let publication :=
            (final, numberInternalPublicationPairs firstTransitionIndex
              (canonicalAcceptedInternalPublicationPairs [leftPublication, rightPublication]))
          refine ⟨publication, ?_, ?_⟩
          · unfold acceptedInternalPairPublication?
            simp only [Option.bind_eq_bind]
            rw [leftStep]
            simp only [Option.bind_some]
            rw [rightSecond]
            simp only [Option.bind_some]
            rw [show acceptedInternalPublicationPair? program instanceId state state
                (applyInternalArmingPatch state leftPatch) left commandId =
                some leftPublication by simpa [leftAfter] using leftAcceptedFirst]
            simp only [Option.bind_some]
            rw [show acceptedInternalPublicationPair? program instanceId state
                (applyInternalArmingPatch state leftPatch) final right commandId =
                some rightPublication by simpa [leftAfter] using rightAcceptedSecond]
            rfl
          · unfold acceptedInternalPairPublication?
            simp only [Option.bind_eq_bind]
            rw [rightStep]
            simp only [Option.bind_some]
            rw [leftSecond]
            simp only [Option.bind_some]
            rw [show acceptedInternalPublicationPair? program instanceId state state
                (applyInternalArmingPatch state rightPatch) right commandId =
                some rightPublication by simpa [rightAfter] using rightAcceptedFirst]
            simp only [Option.bind_some]
            rw [show acceptedInternalPublicationPair? program instanceId state
                (applyInternalArmingPatch state rightPatch) final left commandId =
                some leftPublication by simpa [rightAfter] using leftAcceptedSecond]
            simp only [Option.bind_some]
            rw [← orderedEq]
            rfl

end BpmnSemantics.SemanticProcess
