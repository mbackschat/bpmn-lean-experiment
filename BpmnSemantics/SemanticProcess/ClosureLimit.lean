module

/-! Admission and execution share the automatic-step budget so an accepted composition cannot drift from the runtime bound. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def scenarioClosureLimit : Nat := 8

end BpmnSemantics.SemanticProcess
