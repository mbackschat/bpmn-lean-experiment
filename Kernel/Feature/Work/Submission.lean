module

public import Kernel.Hooks
public import Kernel.Feature.Work.Call

/-! # Work: the scope-chain submission rule

`ProfileOptions.scopeChainSubmissionBytes` selects `NSD-TASK-01` of the
[nested embedded scope data specification](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md)
(CIB-EXT-0020): a User Task completion may name only variables a scope occurrence on the task's chain declares,
below the root of its process instance, or, inside a called instance, the names its Call copies across
(`Call.submissionNames`, CVM-TASK-01), each at most once, and the canonical JSON of the submission may take at most
the selected number of UTF-8 bytes. The name restriction is a profile admission restriction, not CIB behaviour,
which would create a root binding for an undeclared name. Anything else is `rejected` and changes nothing.
-/

public section

namespace Kernel.Feature.Work.Submission

/-- The names the scope occurrences from `scope` up to, but not including, the root of its process instance
declare. -/
def declared (state : State) (scope : ScopeOccurrenceId) : List String :=
  let top := state.instanceRoot scope
  let rec go (fuel : Nat) (current : ScopeOccurrenceId) : List String :=
    match fuel with
    | 0 => []
    | fuel + 1 =>
      if current == top then []
      else
        let own := ((state.variables.find? (·.scope == current)).map (·.entries.map (·.1))).getD []
        match (state.scopes.find? (·.id == current)).bind (·.parent) with
        | some parent => own ++ go fuel parent
        | none => own
  go state.scopes.length scope

/-- Check a submission to the User Task whose item runs in `scope` against `NSD-TASK-01` with the byte limit
`limit`. -/
def check (ctx : Ctx) (state : State) (scope : ScopeOccurrenceId) (limit : Nat) (values : List (String × Value)) :
    Except Failure Unit :=
  let names := values.map (·.1)
  let known := declared state scope ++ Call.submissionNames ctx state scope
  if names.eraseDups.length != names.length then .error (.rejected "submission-duplicate-name")
  else if names.any (!known.contains ·) then .error (.rejected "submission-undeclared-name")
  else
    match entriesBytes values with
    | none => .error (.rejected "submission-value-domain")
    | some sizes => if arrayBytes sizes ≤ limit then .ok () else .error (.rejected "submission-too-large")

end Kernel.Feature.Work.Submission
