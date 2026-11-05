module

public import BpmnSemantics.CheckedProcessContract

/-! PTSM-ADMIT-01 of the [pass-through implicit split and merge proposal](../../docs/capsules/PASS-THROUGH-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#admission): every checked analysis classifies a node as the Program-level analysis classifies its lowered operation. A pass-through Task or None Throw with two or more outgoing flows lowers to a `duplicate` with the node as origin, so it forks; one with two or more incoming flows lowers to a many-input `mergeExclusive`, so it merges. Arity admission keeps both forms apart and confines them to the nested scope-data profile, so these predicates need no profile. The TypeScript twin is `checked-pass-through-flow.ts`. -/

public section

namespace BpmnSemantics.SemanticProcess.CheckedPassThroughFlow

open BpmnSemantics

/-- The pass-through node's id, or none for every other node. -/
private def passThroughId? : CheckedNode → Option NodeId
  | .nonOperationalTask id _ | .noneIntermediateThrowEvent id => some id
  | _ => none

/-- A pass-through node with two or more outgoing flows, which lowers to a node-origin `duplicate`. -/
def splits (flows : List CheckedSequenceFlow) (node : CheckedNode) : Bool :=
  (passThroughId? node).any fun id => 2 ≤ (flows.filter (·.sourceId == id)).length

/-- A pass-through node with two or more incoming flows, which lowers to a many-input `mergeExclusive`. -/
def merges (flows : List CheckedSequenceFlow) (node : CheckedNode) : Bool :=
  (passThroughId? node).any fun id => 2 ≤ (flows.filter (·.targetId == id)).length

/-- A checked node that splits a token, as the Program's `duplicate` and `selectMany` do. -/
def forks (flows : List CheckedSequenceFlow) : CheckedNode → Bool
  | .parallelGateway _ .diverging | .inclusiveGatewayDiverging .. => true
  | node => splits flows node

end BpmnSemantics.SemanticProcess.CheckedPassThroughFlow
