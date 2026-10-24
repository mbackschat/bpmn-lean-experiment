module

public import BpmnSemantics.SemanticProcessContract

/-! CEA-OCCUR-01 and CEA-QUIESCE-01: the scope operations of a merge target, which alone take the
occurrence-addressed path in the embedded completion profile. The entry is the `enterScope` fed by a
`mergeExclusive`; the completion is that entry's child definition's `completeScope`, which always has a parent
continuation, so a root completion is never a merge target and cannot match the occurrence-addressed relation
arm. Every other scope
operation keeps its definition-addressed path and its prepared batches. The predicate is Program-static,
so a Program without a merge region keeps its exact execution. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

def mergeTargetEntry (program : Program) : SemanticOperation → Bool
  | .enterScope _ _ input _ _ => program.operations.any fun candidate => match candidate with
      | .mergeExclusive _ _ _ output => output == input
      | _ => false
  | _ => false

def isMergeTargetOperation (program : Program) (operation : SemanticOperation) : Bool :=
  program.identity.semanticProfile.value == "cibseven-2.2.0-embedded-subprocess-completion-draft" &&
    match operation with
    | .enterScope .. => mergeTargetEntry program operation
    | .completeScope _ _ scopeId (some _) => program.operations.any fun candidate =>
        mergeTargetEntry program candidate && match candidate with
          | .enterScope _ _ _ _ childScopeId => childScopeId == scopeId
          | _ => false
    | _ => false

/-- Every other profile keeps its definition-addressed execution, so consumers of the shared frontier, replay
and relation reduce the merge-target branches away without unfolding the predicate; as a simp lemma it
discharges whenever the simp set fixes another profile. -/
@[simp] theorem isMergeTargetOperation_eq_false_of_profile (program : Program) (operation : SemanticOperation)
    (other : program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft") :
    isMergeTargetOperation program operation = false := by
  simp [isMergeTargetOperation, other]

end BpmnSemantics.SemanticProcess
