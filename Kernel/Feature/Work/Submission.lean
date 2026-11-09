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

/-- Bytes `JSON.stringify` emits for `text` as a JSON string, quotes included: a quote, a backslash and the five
named controls take two bytes, every other control six (`\u00XX`). Every escaped byte is ASCII, so the census runs
over the UTF-8 bytes. -/
def stringBytes (text : String) : Nat :=
  text.toUTF8.foldl (fun total byte =>
    total + match byte.toNat with
      | 0x08 | 0x09 | 0x0a | 0x0c | 0x0d | 0x22 | 0x5c => 2
      | code => if code < 0x20 then 6 else 1) 2

/-- Bytes of a JSON array whose members take `sizes`, brackets and separators included. -/
def arrayBytes (sizes : List Nat) : Nat :=
  2 + sizes.foldl (· + ·) 0 + (sizes.length - 1)

mutual
/-- The canonical JSON bytes of a portable value: no whitespace, `kind` before `value` (or `coefficient` and
`scale`), Map entries `name` before `value` ([NSD-TASK-01](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md)).
A String List is outside the portable value arms and has no measure. -/
def valueBytes : Value → Option Nat
  | .null => some "{\"kind\":\"null\"}".utf8ByteSize
  | .bool value => some ("{\"kind\":\"boolean\",\"value\":}".utf8ByteSize + (toString value).utf8ByteSize)
  | .int value => some ("{\"kind\":\"integer\",\"value\":}".utf8ByteSize + (toString value).utf8ByteSize)
  | .decimal coefficient scale =>
    some ("{\"kind\":\"decimal\",\"coefficient\":,\"scale\":}".utf8ByteSize + stringBytes (toString coefficient) +
      (toString scale).utf8ByteSize)
  | .string value => some ("{\"kind\":\"string\",\"value\":}".utf8ByteSize + stringBytes value)
  | .stringList _ => none
  | .list items => do some ("{\"kind\":\"list\",\"value\":}".utf8ByteSize + arrayBytes (← itemsBytes items))
  | .map entries => do some ("{\"kind\":\"map\",\"value\":}".utf8ByteSize + arrayBytes (← entriesBytes entries))

def itemsBytes : List Value → Option (List Nat)
  | [] => some []
  | item :: items => do some ((← valueBytes item) :: (← itemsBytes items))

/-- Each entry as `{"name":…,"value":…}`. -/
def entriesBytes : List (String × Value) → Option (List Nat)
  | [] => some []
  | (name, value) :: entries => do
    some (("{\"name\":,\"value\":}".utf8ByteSize + stringBytes name + (← valueBytes value)) :: (← entriesBytes entries))
end

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
