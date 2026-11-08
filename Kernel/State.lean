module

public import Kernel.IL.Types

/-! # Kernel runtime state

Flat and identifier-indexed: scope occurrences refer to their parent by identifier, tokens sit on sequence flows,
and every open interaction is one `OpenItem` keyed by an engine-issued identity. The top-level shape is fixed; a
feature keeps its own data in its slot of `FeatureSlots`, which is always present and empty by default, so the state
codec never varies by program.
-/

public section

namespace Kernel

structure ScopeOccurrenceId where
  value : Nat
  deriving DecidableEq, Repr, Inhabited

/-- A scope occurrence: the process instance (`element = none`) or one activation of a Scope element. -/
structure ScopeOccurrence where
  id : ScopeOccurrenceId
  element : Option ElementId
  parent : Option ScopeOccurrenceId
  deriving Repr

/-- A token on a sequence flow, inside a scope occurrence. -/
structure Token where
  flow : FlowId
  scope : ScopeOccurrenceId
  deriving DecidableEq, Repr

structure ScopeVariables where
  scope : ScopeOccurrenceId
  entries : List (String × Value)
  deriving Repr

/-- What an open User Task publishes besides its identity. -/
structure UserTaskDetail where
  name : Option String
  deriving DecidableEq, Repr

/-- Guarded type: only `Kernel.Step` and `Kernel.Publish` match on it. Each kind carries the typed detail its
public observation needs, filled by the feature that opens the item. -/
inductive OpenKind where
  | userTask (detail : UserTaskDetail)
  | receive
  | timer
  | subscription
  | effect
  | incident
  | evaluation
  deriving DecidableEq, Repr

/-- One open interaction. `activation` counts activations of `element` in this process instance, from 1. -/
structure OpenItem where
  id : Nat
  kind : OpenKind
  element : ElementId
  scope : ScopeOccurrenceId
  activation : Nat
  deriving Repr

inductive InstanceStatus where
  | running
  | completed
  | terminated
  deriving DecidableEq, Repr

/-- Feature-owned data. Each slot is fixed at W0.1 from the row traceability table and starts empty. -/
structure FeatureSlots where
  deriving Repr

structure State where
  instanceId : String
  status : InstanceStatus := .running
  scopes : List ScopeOccurrence := []
  tokens : List Token := []
  variables : List ScopeVariables := []
  openItems : List OpenItem := []
  activations : List (ElementId × Nat) := []
  nextIssue : Nat := 1
  logicalTimeMs : Nat := 0
  slots : FeatureSlots := {}
  deriving Repr

/-- Why a step does not commit. Harness failures never appear here. -/
inductive Failure where
  | rejected (code : String)
  | semanticFailure (code : String)
  | unsupported (code : String)
  deriving DecidableEq, Repr

abbrev Outcome := Except Failure State

/-! ## Inputs -/

structure StartInput where
  instanceId : String
  startEvent : Option ElementId := none
  variables : List (String × Value) := []
  deriving Repr

/-- The public identity of an occurrence: the element and its activation number in the instance. -/
structure OccurrenceRef where
  element : ElementId
  activation : Nat
  deriving DecidableEq, Repr

inductive CommandAction where
  | completeUserTask (values : List (String × Value))
  deriving Repr

structure CommandInput where
  occurrence : OccurrenceRef
  action : CommandAction
  deriving Repr

structure DeliveryInput where
  trigger : String
  name : String
  correlation : List (String × Value) := []
  payload : List (String × Value) := []
  deriving Repr

structure TimerInput where
  occurrence : OccurrenceRef
  logicalTimeMs : Nat
  deriving Repr

inductive EffectOutcome where
  | success (outputs : List (String × Value))
  | businessFailure (code : String) (message : Option String)
  | technicalFailure (message : String)
  deriving Repr

structure EffectInput where
  occurrence : OccurrenceRef
  outcome : EffectOutcome
  deriving Repr

/-- The host's answer to an evaluation request, bound to the request's content digest. -/
structure EvaluationInput where
  request : Nat
  contentSha256 : String
  result : Except String Value
  deriving Repr

/-- Guarded type: `Kernel.Step` owns matching on it. -/
inductive Input where
  | start (payload : StartInput)
  | command (payload : CommandInput)
  | deliver (payload : DeliveryInput)
  | timerFire (payload : TimerInput)
  | effectResult (payload : EffectInput)
  | evaluationResult (payload : EvaluationInput)
  deriving Repr

namespace State

def root : ScopeOccurrenceId := ⟨0⟩

/-- A fresh process instance: one root scope occurrence with the given variables. -/
def initial (instanceId : String) (variables : List (String × Value)) : State :=
  { instanceId
    scopes := [{ id := root, element := none, parent := none }]
    variables := [{ scope := root, entries := variables }] }

def emit (state : State) (flows : List FlowId) (scope : ScopeOccurrenceId) : State :=
  { state with tokens := state.tokens ++ flows.map fun flow => { flow, scope } }

/-- The next activation number of `element`, recorded. -/
def activate (state : State) (element : ElementId) : State × Nat :=
  let count := ((state.activations.find? (·.1 == element)).map (·.2)).getD 0 + 1
  ({ state with activations := (element, count) :: state.activations.filter (·.1 != element) }, count)

def issue (state : State) : State × Nat :=
  ({ state with nextIssue := state.nextIssue + 1 }, state.nextIssue)

def openItem (state : State) (kind : OpenKind) (element : ElementId) (scope : ScopeOccurrenceId) : State :=
  let (state, activation) := state.activate element
  let (state, id) := state.issue
  { state with openItems := state.openItems ++ [{ id, kind, element, scope, activation }] }

def closeItem (state : State) (id : Nat) : State :=
  { state with openItems := state.openItems.filter (·.id != id) }

/-- Variables visible from `scope`, innermost first. -/
def visible (state : State) (scope : ScopeOccurrenceId) : List (String × Value) :=
  let rec go (fuel : Nat) (current : Option ScopeOccurrenceId) : List (String × Value) :=
    match fuel, current with
    | 0, _ | _, none => []
    | fuel + 1, some id =>
      let own := ((state.variables.find? (·.scope == id)).map (·.entries)).getD []
      own ++ go fuel ((state.scopes.find? (·.id == id)).bind (·.parent))
  go state.scopes.length (some scope)

/-- Write `name` in the innermost visible scope that declares it, else in `scope` itself. -/
def write (state : State) (scope : ScopeOccurrenceId) (name : String) (value : Value) : State :=
  let declares (id : ScopeOccurrenceId) :=
    ((state.variables.find? (·.scope == id)).map (·.entries.any (·.1 == name))).getD false
  let rec owner (fuel : Nat) (current : ScopeOccurrenceId) : ScopeOccurrenceId :=
    match fuel with
    | 0 => scope
    | fuel + 1 =>
      if declares current then current
      else match (state.scopes.find? (·.id == current)).bind (·.parent) with
        | some parent => owner fuel parent
        | none => scope
  let target := owner state.scopes.length scope
  let replace (entries : List (String × Value)) :=
    if entries.any (·.1 == name) then entries.map fun entry => if entry.1 == name then (name, value) else entry
    else entries ++ [(name, value)]
  if state.variables.any (·.scope == target) then
    { state with variables := state.variables.map fun vars =>
        if vars.scope == target then { vars with entries := replace vars.entries } else vars }
  else
    { state with variables := state.variables ++ [{ scope := target, entries := [(name, value)] }] }

end State

end Kernel
