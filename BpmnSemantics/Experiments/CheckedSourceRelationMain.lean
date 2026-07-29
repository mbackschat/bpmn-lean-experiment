import BpmnSemantics.Experiments.CheckedSourceRelation
import BpmnSemantics.Experiments.CheckedSourceCorrespondence
import BpmnSemantics.Experiments.CheckedSourceAdmission
import BpmnSemantics.SemanticProcess.GraphReachabilityLaws

/-! # BpmnSemantics.Experiments.CheckedSourceRelationMain — checked-source relation experiment gate

This executable retains the fixture-coincidental positional-lowering countermodel and its green controls. It does not make the direct checked-source relation an independent BPMN authority.
-/

open BpmnSemantics.Experiments.CheckedSourceRelation
open BpmnSemantics.Experiments.CheckedSourceCorrespondence
open BpmnSemantics.Experiments.CheckedSourceAdmission

private def requireTrue (condition : Bool) (message : String) : IO Unit :=
  if condition then
    pure ()
  else
    throw (IO.userError message)

def main : IO Unit := do
  requireTrue twoSegmentEnabledTransitionsCorrespond
    "two-segment source and lowered-program enabled transitions diverge"
  requireTrue stageTwoAdmissionChecks
    "Stage 2 graph validation or structured-admission witnesses failed"
  requireTrue retainedFixturesSurvivePositionalLowering
    "positional-lowering mutation no longer leaves every retained fixture lock green"
  requireTrue renamedCountermodelDiverges
    "renamed countermodel no longer separates endpoint-based source semantics from positional lowering"
  requireTrue renamedCountermodelMatchesEndpointLowering
    "direct source account no longer matches endpoint-based lowering on the renamed countermodel"
  IO.println "Checked-source relation experiment checks passed."
