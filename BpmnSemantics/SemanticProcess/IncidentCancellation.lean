import BpmnSemantics.SemanticProcess.Incident
import BpmnSemantics.SemanticProcess.CallActivity
import BpmnSemantics.SemanticProcess.ProfileAdmission
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.ScopeCancellation

/-! # Semantic Process incident cancellation

This module owns root derivation, exact incident-gated Process cancellation, and its declarative
relation. It uses the shared destructive cleanup only after the successor profile and submitted public
identities select one hosting root.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Derive the unique parentless occurrence whose semantic Process identity equals the running root. -/
def incidentCancellationRoot? (state : RuntimeState)
    (instanceId : SemanticId) : Option ScopeOccurrenceId :=
  match state.scopeOccurrences.filter fun occurrence =>
      occurrence.parent.isNone && occurrence.id.processInstanceId == instanceId with
  | [root] => some root.id
  | _ => none

private def exactIncident? (state : RuntimeState)
    (incidentId : EffectIncidentId) : Option SemanticEffectIncident :=
  match state.effectIncidents.filter (effectIncidentMatches incidentId) with
  | [incident] => some incident
  | _ => none

/-- The exact derived root and its single cleanup result for one committable cancellation. -/
structure IncidentProcessCancellationEligibility where
  root : ScopeOccurrenceId
  cleaned : RuntimeState
  deriving DecidableEq

/-- Whether cleanup left no live execution owner in any represented runtime family. -/
def incidentCancellationLiveRegionEmpty (state : RuntimeState) : Bool :=
  state.scopeOccurrences.isEmpty &&
    state.tokens.isEmpty &&
    state.waits.isEmpty &&
    state.messageWaits.isEmpty &&
    state.timerWaits.isEmpty &&
    state.effectWaits.isEmpty &&
    state.effectIncidents.isEmpty &&
    state.selectedBranchSets.isEmpty &&
    state.eventRaces.isEmpty &&
    state.calledProcessOccurrences.isEmpty &&
    state.variables.activities.isEmpty

/-- Decide every commit precondition and retain the one validated cleanup result. -/
def incidentProcessCancellationEligibility? (program : Program)
    (state : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId) :
    Option IncidentProcessCancellationEligibility :=
  if program.identity.semanticProfile ≠
      serviceTaskIncidentCancellationCheckpointProfileId ||
      !programWellFormed program ||
      !programProfileCapabilitiesValid program ||
      state.initiationPending ||
      state.effectIncidents.length ≠ 1 ||
      !effectIncidentAssociationsValid state ||
      !calledProcessAssociationsValid state then none
  else
    match state.control with
    | .running instanceId =>
        if processInstanceId ≠ instanceId ||
            incidentId.effectId.processInstanceId ≠ instanceId then none
        else
          match incidentCancellationRoot? state instanceId,
              exactIncident? state incidentId with
          | some root, some incident =>
              if occurrenceInSubtree state.scopeOccurrences root incident.wait.owner then
                let cleaned := cancelScopeSubtree state root .remove
                if incidentCancellationLiveRegionEmpty cleaned then
                  some { root, cleaned }
                else none
              else none
          | _, _ => none
    | .notStarted | .completed _ | .cancelled _ => none

/-- Project only the root from the exact cancellation eligibility result. -/
def incidentProcessCancellationRoot? (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId) :
    Option ScopeOccurrenceId :=
  (incidentProcessCancellationEligibility? program state processInstanceId incidentId).map
    (fun eligibility => eligibility.root)

/-- Every admitted eligibility retains exactly the one cleanup it validated as live-region empty. -/
theorem incidentProcessCancellationEligibility_exact
    (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId)
    (eligibility : IncidentProcessCancellationEligibility)
    (admitted : incidentProcessCancellationEligibility? program state
      processInstanceId incidentId = some eligibility) :
    cancelScopeSubtree state eligibility.root .remove = eligibility.cleaned ∧
      incidentCancellationLiveRegionEmpty eligibility.cleaned = true := by
  unfold incidentProcessCancellationEligibility? at admitted
  repeat' split at admitted
  all_goals simp_all
  obtain ⟨noLiveRegion, rfl⟩ := admitted
  exact ⟨rfl, noLiveRegion⟩

/-- Enter the terminal control state only after the selected region has been cleaned completely. -/
def cancelledIncidentRootState (cleaned : RuntimeState)
    (instanceId : SemanticId) : RuntimeState :=
  { cleaned with
    control := .cancelled instanceId
    initiationPending := false }

/-- Declarative account of committing one exact incident-gated hosting-root cancellation. -/
inductive IncidentProcessCancellationStep :
    Program → RuntimeState → SemanticId → EffectIncidentId → RuntimeState → Prop where
  | commit
      (program : Program)
      (state : RuntimeState)
      (processInstanceId : SemanticId)
      (incidentId : EffectIncidentId)
      (eligibility : IncidentProcessCancellationEligibility)
      (admitted : incidentProcessCancellationEligibility? program state
        processInstanceId incidentId = some eligibility)
      (cleanup : cancelScopeSubtree state eligibility.root .remove =
        eligibility.cleaned)
      (noLiveRegion : incidentCancellationLiveRegionEmpty eligibility.cleaned = true) :
      IncidentProcessCancellationStep program state processInstanceId incidentId
        (cancelledIncidentRootState eligibility.cleaned processInstanceId)

/-- Cancel the exact hosting root selected by the public Process and incident identities. -/
def cancelIncidentProcess (program : Program) (state : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId) :
    Option RuntimeState :=
  match incidentProcessCancellationEligibility? program state processInstanceId incidentId with
  | none => none
  | some eligibility =>
      some (cancelledIncidentRootState eligibility.cleaned processInstanceId)

/-- Every successful executable cancellation is permitted by the declarative relation. -/
theorem cancelIncidentProcess_sound
    (program : Program) (state successor : RuntimeState)
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId)
    (success : cancelIncidentProcess program state processInstanceId incidentId =
      some successor) :
    IncidentProcessCancellationStep program state processInstanceId incidentId successor := by
  unfold cancelIncidentProcess at success
  split at success
  · contradiction
  · rename_i eligibility admitted
    cases success
    obtain ⟨cleanup, noLiveRegion⟩ :=
      incidentProcessCancellationEligibility_exact program state
        processInstanceId incidentId eligibility admitted
    exact .commit program state processInstanceId incidentId eligibility admitted
      cleanup noLiveRegion

end BpmnSemantics.SemanticProcess
