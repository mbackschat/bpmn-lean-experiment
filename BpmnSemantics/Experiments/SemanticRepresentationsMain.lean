import BpmnSemantics.Experiments.SemanticRepresentations

/-! # BpmnSemantics.Experiments.SemanticRepresentationsMain — bounded representation spike gate

This executable checks only the separating witnesses documented for the semantic-representation spike. It makes no BPMN conformance or CIB Seven compatibility claim.
-/

open BpmnSemantics.Experiments.SemanticRepresentations

private def requireTrue (condition : Bool) (message : String) : IO Unit :=
  if condition then
    pure ()
  else
    throw (IO.userError message)

def main : IO Unit := do
  requireTrue sourceToIrWitness
    "source-to-IR witness did not preserve the intended semantic structure"
  requireTrue distinctScopeRelationsWitness
    "candidate IR cannot represent distinct flow and event scopes"
  requireTrue countOnlyAcceptsDuplicateArrivalWitness
    "seeded count-only join account no longer accepts the duplicate-arrival counterexample"
  requireTrue edgeProvenanceRejectsDuplicateArrivalWitness
    "edge-provenance join account accepted two arrivals from the same incoming flow"
  requireTrue startCommandClosureWitness
    "start command did not close at the expected User Task wait"
  requireTrue completionCommandClosureWitness
    "User Task completion did not close at Process completion"
  IO.println "Semantic representation spike checks passed."
