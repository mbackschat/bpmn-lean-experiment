import BpmnSemantics.SemanticProcess.SimpleBooleanExpression
import BpmnSemantics.SemanticProcess.ValueDomain

/-! # Structured Human Work profile topology

This module owns the exact representation-neutral Start to User Task to conditional choice to three
End branches required by the structured Human Work profile. It excludes Product 2 form and Rendering
content, which have no semantic authority.
-/

namespace BpmnSemantics.SemanticProcess

private def exactSet [DecidableEq α] (actual expected : List α) : Bool :=
  actual.length = expected.length &&
    expected.all (fun value => decide (value ∈ actual)) &&
    decide expected.Nodup

private def checkedFlow? (source : CheckedProcess) (id : SequenceFlowId) :
    Option CheckedSequenceFlow :=
  source.sequenceFlows.find? fun flow => decide (flow.id = id)

private def checkedStructuredHumanWorkTopology (source : CheckedProcess) : Bool :=
  match source.nodes.filterMap fun
      | .noneStartEvent id => some id
      | _ => none,
    source.nodes.filterMap fun
      | .userTask id _ _ => some id
      | _ => none,
    source.nodes.filterMap fun
      | .exclusiveGateway id candidates fallback => some (id, candidates, fallback)
      | _ => none,
    source.nodes.filterMap fun
      | .noneEndEvent id => some id
      | _ => none with
  | [start], [task], [(choice, [approvedId, changesId], abortedId)], ends =>
      match checkedFlow? source approvedId, checkedFlow? source changesId,
          checkedFlow? source abortedId with
      | some approved, some changes, some aborted =>
          match source.sequenceFlows.filter fun flow =>
              decide (flow.sourceId = start && flow.targetId = task),
            source.sequenceFlows.filter fun flow =>
              decide (flow.sourceId = task && flow.targetId = choice) with
          | [startToTask], [taskToChoice] =>
              source.sequenceFlows.length = 5 &&
                startToTask.condition.isNone && taskToChoice.condition.isNone &&
                approved.sourceId = choice && changes.sourceId = choice &&
                aborted.sourceId = choice && aborted.condition.isNone &&
                approved.condition.isSome && changes.condition.isSome &&
                exactSet ends [approved.targetId, changes.targetId, aborted.targetId] &&
                exactSet (source.sequenceFlows.map (·.id))
                  [startToTask.id, taskToChoice.id, approvedId, changesId, abortedId]
          | _, _ => false
      | _, _, _ => false
  | _, _, _, _ => false

private def programStructuredHumanWorkTopology (program : Program) : Bool :=
  match program.operations.filterMap fun
      | .initiate _ _ output => some output
      | _ => none,
    program.operations.filterMap fun
      | .awaitUserTask _ _ input output _ => some (input, output)
      | _ => none,
    program.operations.filterMap fun
      | .choose _ _ input candidates fallback _ => some (input, candidates, fallback)
      | _ => none,
    program.operations.filterMap fun
      | .reachNoneEnd _ _ input => some input
      | _ => none with
  | [startOutput], [(taskInput, taskOutput)],
      [(choiceInput, candidates, aborted)], ends =>
      match candidates with
      | [approved, changes] =>
          decide (startOutput = taskInput) &&
            decide (taskOutput = choiceInput) &&
            exactSet ends [approved.output, changes.output, aborted]
      | _ => false
  | _, _, _, _ => false

/-- Require the exact checked and lowered control shape only for the selected M6 profile. -/
def structuredHumanWorkCheckedTopologyValid (source : CheckedProcess) : Bool :=
  if source.identity.semanticProfile = structuredHumanWorkProfileId then
    checkedStructuredHumanWorkTopology source
  else true

def structuredHumanWorkProgramTopologyValid (program : Program) : Bool :=
  if program.identity.semanticProfile = structuredHumanWorkProfileId then
    programStructuredHumanWorkTopology program
  else true

end BpmnSemantics.SemanticProcess
