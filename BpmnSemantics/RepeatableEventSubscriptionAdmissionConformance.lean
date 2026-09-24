import BpmnSemantics.ActivityBoundaryMessageConformance

/-! Constructed checked graphs discriminate the selected subscription profile and its whole-burst
limit. Exact XML provenance and independent lowering are owned by the source-bound pipeline. -/

namespace BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance

open BpmnSemantics.SemanticProcess

def checkedProcess : CheckedProcess :=
  { ActivityBoundaryMessageConformance.checkedProcess with
    identity := { ActivityBoundaryMessageConformance.checkedProcess.identity with
      semanticProfile := repeatableSubscriptionCheckpointProfileId
      sourceId := ⟨"constructed-repeatable-message"⟩ }
    nodes := ActivityBoundaryMessageConformance.checkedProcess.nodes.map fun
      | .messageBoundaryEvent id host _ channel output =>
          .messageBoundaryEvent id host .nonInterrupting channel output
      | node => node }

def program : Program := lowerCheckedProcess checkedProcess

theorem repeated_message_graph_and_lowering_are_admitted :
    checkedWellFormed checkedProcess = true ∧ programWellFormed program = true ∧
      programProfileCapabilitiesValid program = true ∧ repeatableSubscriptionProgramGraph program = true := by
  decide +kernel

theorem old_profile_does_not_gain_repeated_message_admission :
    checkedWellFormed { checkedProcess with
      identity := ActivityBoundaryMessageConformance.checkedProcess.identity } = false := by
  decide +kernel

private def burstProcess (width : Nat) : CheckedProcess :=
  let process : ProcessId := ⟨"Burst"⟩
  let ids := List.range width
  let nodes : List CheckedNode :=
    ids.map (fun i => .noneEndEvent ⟨s!"End_{i}"⟩) ++
    [.parallelGateway ⟨"Fork"⟩ .diverging, .noneStartEvent ⟨"Start"⟩] ++
    ids.map (fun i => .userTask ⟨s!"Task_{i}"⟩ none)
  let flows : List CheckedSequenceFlow :=
    ids.map (fun i => { id := ⟨s!"Flow_In_{i}"⟩, sourceId := ⟨"Fork"⟩, targetId := ⟨s!"Task_{i}"⟩ }) ++
    ids.map (fun i => { id := ⟨s!"Flow_Out_{i}"⟩, sourceId := ⟨s!"Task_{i}"⟩, targetId := ⟨s!"End_{i}"⟩ }) ++
    [{ id := ⟨"Flow_Start"⟩, sourceId := ⟨"Start"⟩, targetId := ⟨"Fork"⟩ }]
  { identity := { checkedProcess.identity with sourceId := ⟨s!"constructed-burst-{width}"⟩ }
    processId := process
    definitionScopes := [rootDefinitionScope process]
    nodeScopes := rootNodeScopes process (nodes.map (·.id))
    sequenceFlowScopes := rootSequenceFlowScopes process (flows.map (·.id))
    nodes, sequenceFlows := flows }

theorem eight_operation_start_burst_is_admitted :
    checkedWellFormed (burstProcess 6) = true ∧
      programProfileCapabilitiesValid (lowerCheckedProcess (burstProcess 6)) = true := by
  decide +kernel

theorem ninth_operation_is_refused_in_both_representations :
    checkedWellFormed (burstProcess 7) = false ∧
      programProfileCapabilitiesValid (lowerCheckedProcess (burstProcess 7)) = false := by
  decide +kernel

theorem second_boundary_is_refused_before_preparation :
    repeatableSubscriptionProgramGraph
      { program with operations := program.operations ++ program.operations.filter repeatableSubscriptionBoundaryOperation } = false := by
  decide +kernel

end BpmnSemantics.RepeatableEventSubscriptionAdmissionConformance
