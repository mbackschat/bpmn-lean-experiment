module

public import Kernel.State

/-! # Writing variables

The frame a write lands in (`declaring?`, `owner?`) and the two write primitives, `setVariable` and `removeVariable`,
which log each write for `Hooks.written`. Part of the State layer, above `Kernel.State`; its one caller,
`Kernel.Feature.Data`, the only writer of variables (guard 17), imports it directly.
-/

public section

namespace Kernel

namespace State

/-- The nearest occurrence of the Scope `element` from `scope` outward, up to the root of its process instance: the
occurrence whose frame holds the items `element` declares for a site in `scope`. -/
def declaring? (state : State) (scope : ScopeOccurrenceId) (element : ElementId) : Option ScopeOccurrenceId :=
  let rec go : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments →
      Option ScopeOccurrenceId
    | [], _, _ => if ((state.scopes.find? (·.id == root)).bind (·.element)) == some element then some root else none
    | _ :: rest, scope, segments =>
      if ((state.scopes.find? (·.id == scope)).bind (·.element)) == some element then some scope
      else if state.calledRoot scope then none
      else if state.stands scope then go rest (scope.up segments) rfl else none
  go scope.segments scope rfl

/-- Whether the own variables of `scope` bind `name`. -/
def bindsOwn (state : State) (scope : ScopeOccurrenceId) (name : String) : Bool :=
  ((state.variables.find? (·.scope == scope)).map (·.entries.any (·.1 == name))).getD false

/-- The innermost scope visible from `scope` that declares `name`, up to the root of its process instance. -/
def owner? (state : State) (scope : ScopeOccurrenceId) (name : String) : Option ScopeOccurrenceId :=
  let rec go : (segments : List ScopeSegment) → (scope : ScopeOccurrenceId) → scope.segments = segments →
      Option ScopeOccurrenceId
    | [], _, _ => if state.bindsOwn root name then some root else none
    | _ :: rest, scope, segments =>
      if state.bindsOwn scope name then some scope
      else if state.calledRoot scope then none
      else if state.stands scope then go rest (scope.up segments) rfl else none
  go scope.segments scope rfl

/-- Set `name` in `target`'s own variables and log the write. -/
def setVariable (state : State) (target : ScopeOccurrenceId) (name : String) (value : Value) : State :=
  let replace (entries : List (String × Value)) :=
    if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
    else entries ++ [(name, value)]
  let kind : VariableEvent :=
    if ((state.variables.find? (·.scope == target)).map (·.entries.any (·.1 == name))).getD false then .update
    else .create
  let written := { state with writes := state.writes ++ [({ scope := target, name, kind } : WriteEvent)] }
  if written.variables.any (·.scope == target) then
    { written with variables := written.variables.map fun vars =>
        if vars.scope == target then { vars with entries := replace vars.entries } else vars }
  else
    { written with variables := written.variables ++ [{ scope := target, entries := [(name, value)] }] }

/-- Delete `name` from `target`'s own variables and log the deletion. -/
def removeVariable (state : State) (target : ScopeOccurrenceId) (name : String) : State :=
  { state with
      writes := state.writes ++ [({ scope := target, name, kind := .delete } : WriteEvent)]
      variables := state.variables.map fun vars =>
        if vars.scope == target then { vars with entries := vars.entries.filter (·.1 != name) } else vars }

end State

end Kernel
