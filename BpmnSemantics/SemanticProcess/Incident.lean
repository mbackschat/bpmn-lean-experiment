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

/-- Incident association validity is framed by the runtime fields its owner predicate reads. -/
theorem effectIncidentAssociationsValid_frame (before after : RuntimeState)
    (controlFrame : after.control = before.control)
    (scopesFrame : after.scopeOccurrences = before.scopeOccurrences)
    (waitsFrame : after.effectWaits = before.effectWaits)
    (activitiesFrame : after.variables.activities = before.variables.activities)
    (incidentsFrame : after.effectIncidents = before.effectIncidents) :
    effectIncidentAssociationsValid after = effectIncidentAssociationsValid before := by
  simp [effectIncidentAssociationsValid, effectIncidentAssociationValid,
    effectWaitOwnerAssociationValid, controlFrame, scopesFrame, waitsFrame,
    activitiesFrame, incidentsFrame]

theorem filter_insertActivityVariableScope_of_rejected
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (rejected : predicate inserted = false) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).filter predicate = values.filter predicate := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope, rejected]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split
      · simp [rejected]
      · simp only [List.filter_cons, ih]

theorem filter_insertActivityVariableScope_eq_singleton
    (predicate : ActivityVariableScope → Bool) (inserted : ActivityVariableScope)
    (accepted : predicate inserted = true)
    (rejected : ∀ value ∈ values, predicate value = false) :
    (insertActivityVariableScope inserted values).filter predicate = [inserted] := by
  induction values with
  | nil => simp [insertActivityVariableScope, accepted]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      have currentRejected := rejected current (by simp)
      have restRejected : ∀ value ∈ rest, predicate value = false := by
        intro value member
        exact rejected value (by simp [member])
      have restEmpty : rest.filter predicate = [] := List.filter_eq_nil_iff.mpr (by
        intro value member acceptedValue
        rw [restRejected value member] at acceptedValue
        contradiction)
      split
      · simp [accepted, currentRejected, restEmpty]
      · simp [currentRejected, ih restRejected]

theorem all_insertActivityVariableScope (predicate : ActivityVariableScope → Bool)
    (inserted : ActivityVariableScope) : ∀ values : List ActivityVariableScope,
    (insertActivityVariableScope inserted values).all predicate =
      (predicate inserted && values.all predicate) := by
  intro values
  induction values with
  | nil => simp [insertActivityVariableScope]
  | cons current rest ih =>
      simp only [insertActivityVariableScope]
      split <;> simp_all [Bool.and_left_comm]

/-- Adding a fresh ordinary effect occurrence preserves the existing incident association. -/
theorem effectIncidentAssociationsValid_insertEffectFrame (state : RuntimeState)
    (inserted : EffectWait) (bindings : List VariableBinding)
    (fresh : ∀ incident ∈ state.effectIncidents,
      effectWaitOccurrenceId inserted ≠ effectWaitOccurrenceId incident.wait)
    (valid : effectIncidentAssociationsValid state = true) :
    effectIncidentAssociationsValid
      { state with
        effectWaits := insertEffectWait inserted state.effectWaits
        variables := addActivityVariableScope state.variables
          (effectWaitOccurrenceId inserted) bindings } = true := by
  have anyFrame (predicate : EffectWait → Bool) (rejected : predicate inserted = false) :
      (insertEffectWait inserted state.effectWaits).any predicate =
        state.effectWaits.any predicate := by
    have canonicalFrame : ∀ values : List EffectWait,
        (canonicalInsertBy effectWaitBefore inserted values).any predicate =
          values.any predicate := by
      intro values
      induction values with
      | nil => simp [canonicalInsertBy, rejected]
      | cons current rest ih =>
          simp only [canonicalInsertBy]
          split <;> simp [rejected, ih]
    exact canonicalFrame state.effectWaits
  have activityFrame (predicate : ActivityVariableScope → Bool)
      (rejected : predicate { owner := effectWaitOccurrenceId inserted, bindings } = false) :
      (insertActivityVariableScope
          { owner := effectWaitOccurrenceId inserted, bindings }
          state.variables.activities).filter predicate =
        state.variables.activities.filter predicate :=
    filter_insertActivityVariableScope_of_rejected predicate _ rejected _
  simp only [effectIncidentAssociationsValid] at valid ⊢
  cases incidentsEq : state.effectIncidents with
  | nil => simp
  | cons incident rest =>
      cases rest with
      | cons next tail => simp_all
      | nil =>
          have different := fresh incident (by simp [incidentsEq])
          simp only [incidentsEq] at valid ⊢
          have identity : incident.id.effectId = effectWaitOccurrenceId incident.wait := by
            simp only [effectIncidentAssociationValid, Bool.and_eq_true,
              decide_eq_true_eq] at valid
            exact valid.1.1.1.1.2
          have waitRejected : effectOccurrenceMatches incident.id.effectId inserted = false := by
            apply Bool.eq_false_iff.mpr
            intro matched
            apply different
            simp only [effectOccurrenceMatches, decide_eq_true_eq] at matched
            cases inserted
            cases incident.id.effectId
            cases incident.wait
            simp_all [effectWaitOccurrenceId]
          have activityRejected : activityScopeMatches incident.id.effectId
              { owner := effectWaitOccurrenceId inserted, bindings } = false := by
            apply Bool.eq_false_iff.mpr
            intro matched
            apply different
            simp only [activityScopeMatches, decide_eq_true_eq] at matched
            cases inserted
            cases incident.id.effectId
            cases incident.wait
            simp_all [effectWaitOccurrenceId]
          simpa [effectIncidentAssociationValid, effectWaitOwnerAssociationValid,
            addActivityVariableScope, anyFrame, activityFrame, waitRejected,
            activityRejected] using valid

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
          effectWaits := insertEffectWait
            { incident.wait with incidentAlreadyRetried := true }
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
            effectWaits := insertEffectWait
              { incident.wait with incidentAlreadyRetried := true }
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
