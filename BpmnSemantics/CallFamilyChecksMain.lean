module

public import BpmnSemantics.CallActivityConformance
public import BpmnSemantics.CallActivityDataBoundariesConformance
public import BpmnSemantics.CallActivityPairingConformance
public import BpmnSemantics.CallVariableMappingConformance
public import BpmnSemantics.RepeatedNestedConcurrentCallsAdmissionConformance
public import BpmnSemantics.RepeatedNestedConcurrentCallsConformance

/-! # Call family executable checks

Runs the Call family's conformance checks natively and exits nonzero when any is `false`, naming each
failing check by module and declaration. No proof consumes these checks, so they are compiled `Bool`
decisions rather than kernel-decided theorems: kernel reduction cost the six modules about 425 s of
single-core elaboration ([cost ledger](../scripts/lean-module-cost.ts) as of 2026-10-23), and the
checked lane shape admits an executable guard (owner pilot decision 2026-10-23,
[executable guards](../docs/LEAN-BUILD-MODULARITY-SPEC.md#contract)). A fact a proof consumes
stays a kernel-decided theorem. -/

@[expose] public section

open BpmnSemantics in
def callFamilyChecks : List (String × List (String × Bool)) := [
  ("CallActivityConformance", CallActivityConformance.checks),
  ("CallActivityDataBoundariesConformance", CallActivityDataBoundariesConformance.checks),
  ("CallActivityPairingConformance", CallActivityPairingConformance.checks),
  ("CallVariableMappingConformance", CallVariableMappingConformance.checks),
  ("RepeatedNestedConcurrentCallsAdmissionConformance", RepeatedNestedConcurrentCallsConformance.admissionChecks),
  ("RepeatedNestedConcurrentCallsConformance", RepeatedNestedConcurrentCallsConformance.checks)
]

def main : IO UInt32 := do
  let failed := callFamilyChecks.flatMap fun (module, checks) =>
    checks.filterMap fun (name, holds) => if holds then none else some s!"{module}.{name}"
  for name in failed do
    IO.eprintln s!"check failed: {name}"
  let total := callFamilyChecks.foldl (fun count (_, checks) => count + checks.length) 0
  IO.println s!"{total - failed.length} of {total} Call family checks hold"
  return if failed.isEmpty then 0 else 1
