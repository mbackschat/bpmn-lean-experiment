import BpmnSemantics.SemanticProcess.EffectCompletion

/-! # Semantic Process effect incidents

This module owns the private incident association, the one literal-generation report and retry relations, and their executable transitions. It preserves the complete suspended effect wait and does not define host failure, CIB identity, cancellation, or general BPMN fault meaning.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Recover the public occurrence identity carried by an effect wait. -/
def effectWaitOccurrenceId (wait : EffectWait) : EffectOccurrenceId :=
  { processInstanceId := wait.processInstanceId
    elementId := ⟨wait.elementId.value⟩
    activation := wait.activation }

def effectIncidentMatches (incidentId : EffectIncidentId)
    (incident : SemanticEffectIncident) : Bool :=
  decide (incident.id = incidentId)

/-- A suspended effect owner is bound to the one running Process instance and exactly one matching live scope occurrence. -/
def effectWaitOwnerAssociationValid (state : RuntimeState)
    (wait : EffectWait) : Bool :=
  match state.control with
  | .running instanceId =>
      decide (
        wait.processInstanceId = instanceId ∧
          wait.owner.processInstanceId = instanceId) &&
        (state.scopeOccurrences.filter fun occurrence =>
          occurrence.id == wait.owner).length = 1
  | .notStarted | .completed _ | .cancelled _ => false

/-- One incident is well associated exactly when it retains its named wait, live scope owner, and unique Activity-local scope while the same occurrence is absent from the open-effect collection. -/
def effectIncidentAssociationValid (state : RuntimeState)
    (incident : SemanticEffectIncident) : Bool :=
  incident.id.generation = 1 &&
    incident.id.effectId = effectWaitOccurrenceId incident.wait &&
    incident.wait.incidentAlreadyRetried = false &&
    effectWaitOwnerAssociationValid state incident.wait &&
    (state.variables.activities.filter
      (activityScopeMatches incident.id.effectId)).length = 1 &&
    !(state.effectWaits.any (effectOccurrenceMatches incident.id.effectId))

/-- The bounded successor admits either no incident or one exact, valid incident. -/
def effectIncidentAssociationsValid (state : RuntimeState) : Bool :=
  match state.effectIncidents with
  | [] => true
  | [incident] => effectIncidentAssociationValid state incident
  | _ => false

/-- A live wait may enter incident state only when its occurrence and Activity-local scope are unique and no incident is already open. -/
def effectWaitReadyForIncident (state : RuntimeState) (effectId : EffectOccurrenceId)
    (wait : EffectWait) : Bool :=
  wait.incidentAlreadyRetried = false &&
    effectId = effectWaitOccurrenceId wait &&
    state.effectIncidents.isEmpty &&
    state.effectWaits.length = 1 &&
    (state.effectWaits.filter (effectOccurrenceMatches effectId)).length = 1 &&
    effectWaitOwnerAssociationValid state wait &&
    (state.variables.activities.filter
      (activityScopeMatches effectId)).length = 1

/-- Declarative account of moving one never-retried effect wait into generation-one incident state. -/
inductive EffectIncidentReportStep :
    RuntimeState → EffectOccurrenceId → Nat → RuntimeState → Prop where
  | commit
      (state : RuntimeState)
      (effectId : EffectOccurrenceId)
      (wait : EffectWait)
      (occurrence :
        state.effectWaits.find? (effectOccurrenceMatches effectId) = some wait)
      (ready : effectWaitReadyForIncident state effectId wait = true) :
      EffectIncidentReportStep state effectId 1
        { state with
          effectWaits := state.effectWaits.erase wait
          effectIncidents :=
            [{ id := { effectId, generation := 1 }, wait }] }

/-- Report the only admitted technical failure, suspending the complete effect wait without changing any other runtime component. -/
def reportEffectFailure (state : RuntimeState) (effectId : EffectOccurrenceId)
    (generation : Nat) : Option RuntimeState :=
  if generation ≠ 1 then none
  else
    match state.effectWaits.find? (effectOccurrenceMatches effectId) with
    | none => none
    | some wait =>
        if !effectWaitReadyForIncident state effectId wait then none
        else
          some
            { state with
              effectWaits := state.effectWaits.erase wait
              effectIncidents :=
                [{ id := { effectId, generation := 1 }, wait }] }

/-- Every successful executable failure report is permitted by the separately stated report relation. -/
theorem reportEffectFailure_sound
    (state successor : RuntimeState) (effectId : EffectOccurrenceId)
    (generation : Nat)
    (success : reportEffectFailure state effectId generation = some successor) :
    EffectIncidentReportStep state effectId generation successor := by
  unfold reportEffectFailure at success
  split at success
  · contradiction
  · rename_i generationOne
    split at success
    · contradiction
    · rename_i wait occurrence
      split at success
      · contradiction
      · cases success
        have ready : effectWaitReadyForIncident state effectId wait = true := by
          cases valid : effectWaitReadyForIncident state effectId wait <;> simp_all
        have exactGeneration : generation = 1 := Decidable.not_not.mp generationOne
        subst generation
        exact .commit state effectId wait occurrence ready

/-- Declarative account of restoring the exact suspended wait with only the retry marker changed. -/
inductive EffectIncidentRetryStep :
    RuntimeState → EffectIncidentId → RuntimeState → Prop where
  | commit
      (state : RuntimeState)
      (incidentId : EffectIncidentId)
      (incident : SemanticEffectIncident)
      (occurrence :
        state.effectIncidents.find? (effectIncidentMatches incidentId) =
          some incident)
      (associations : effectIncidentAssociationsValid state = true) :
      EffectIncidentRetryStep state incidentId
        { state with
          effectIncidents := state.effectIncidents.erase incident
          effectWaits :=
            { incident.wait with incidentAlreadyRetried := true } ::
              state.effectWaits }

/-- Retry one exact generation-one incident, restoring its complete effect wait with the one-retry marker set. -/
def retryEffectIncident (state : RuntimeState)
    (incidentId : EffectIncidentId) : Option RuntimeState :=
  if !effectIncidentAssociationsValid state then none
  else
    match state.effectIncidents.find? (effectIncidentMatches incidentId) with
    | none => none
    | some incident =>
        some
          { state with
            effectIncidents := state.effectIncidents.erase incident
            effectWaits :=
              { incident.wait with incidentAlreadyRetried := true } ::
                state.effectWaits }

/-- Every successful executable retry is permitted by the separately stated retry relation. -/
theorem retryEffectIncident_sound
    (state successor : RuntimeState) (incidentId : EffectIncidentId)
    (success : retryEffectIncident state incidentId = some successor) :
    EffectIncidentRetryStep state incidentId successor := by
  unfold retryEffectIncident at success
  split at success
  · contradiction
  · rename_i associations
    split at success
    · contradiction
    · rename_i incident occurrence
      cases success
      apply EffectIncidentRetryStep.commit state incidentId incident occurrence
      cases valid : effectIncidentAssociationsValid state <;> simp_all

end BpmnSemantics.SemanticProcess
