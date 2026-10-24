import BpmnSemantics.ConcurrentEmbeddedActivationsFixtures

/-! # Repeated, nested and concurrent Calls fixtures

The retained supplier onboarding forest of the cumulative embedded completion profile and the small Call
forests its admission witnesses compare: each refused forest differs from its admitted control in the one
fact its name states. Processes are named by one letter and the entry Process is `P`; a body step `T` is a
User Task and any other step names the Process a Call invokes. The journey helpers address tasks by element
and activation across called instances. This module states no theorem, so each conformance module decides
only its own facts. -/

namespace BpmnSemantics.RepeatedNestedConcurrentCallsConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.ConcurrentEmbeddedActivationsConformance (build node start finish fork join task sub)

def call (owner id callee : String) := node owner (.callActivity ⟨id⟩ ⟨callee⟩)

/-- One Process body: its members and its flows. -/
abbrev Body := List (String × String × CheckedNode) × List (String × String)

def chain (ids : List String) : List (String × String) := ids.zip ids.tail

def callsStep (owner id value : String) : String × String × CheckedNode :=
  if value == "T" then task owner id else call owner id value

/-- Explicit suffixes keep vertex ids free of `Nat.repr`, which the kernel would otherwise reduce. -/
def suffixes : List String := ["0", "1", "2", "3", "4"]

/-- None Start, the steps in order, None End. -/
def serial (owner : String) (steps : List String) : Body :=
  let ids := (suffixes.take steps.length).map (owner ++ "V" ++ ·)
  (start owner (owner ++ "S") :: finish owner (owner ++ "E") :: (steps.zip ids).map (fun (value, id) => callsStep owner id value),
    chain ((owner ++ "S") :: ids ++ [owner ++ "E"]))

/-- None Start, a Parallel fork into the serial branches, their join, None End. -/
def forked (owner : String) (branches : List (List String)) : Body :=
  let branch := fun (label : String) (steps : List String) =>
    let ids := (suffixes.take steps.length).map (owner ++ "B" ++ label ++ "V" ++ ·)
    ((steps.zip ids).map (fun (value, id) => callsStep owner id value), chain ((owner ++ "F") :: ids ++ [owner ++ "J"]))
  let arms := (branches.zip (suffixes.take branches.length)).map fun (steps, label) => branch label steps
  ([start owner (owner ++ "S"), fork owner (owner ++ "F"), join owner (owner ++ "J"), finish owner (owner ++ "E")] ++
      arms.flatMap (·.1),
    [(owner ++ "S", owner ++ "F"), (owner ++ "J", owner ++ "E")] ++ arms.flatMap (·.2))

/-- A Definitions forest of parentless Process roots; the first is the entry Process `P`. -/
def forest (processes : List (String × Body)) : CheckedProcess :=
  build (processes.map fun (name, _) => (name, none)) (processes.flatMap (·.2.1)) (processes.flatMap (·.2.2))

/-- Supplier onboarding: register `PR`, fork tax documents `PT` into the tax approval `PX` against bank
details `PB` into the bank approval `PY`, join, review risk `PK`, final approval `PL`. Four-eyes approval
`F` prepares `FP` and approves `FV`; risk review `R` assesses `RS` and calls the compliance check `C`, which
screens sanctions `CS`. -/
def supplier : CheckedProcess :=
  build [("P", none), ("F", none), ("R", none), ("C", none)]
    [ start "P" "PA", task "P" "PR", fork "P" "PF", task "P" "PT", call "P" "PX" "F", task "P" "PB"
    , call "P" "PY" "F", join "P" "PJ", call "P" "PK" "R", call "P" "PL" "F", finish "P" "PZ"
    , start "F" "FA", task "F" "FP", task "F" "FV", finish "F" "FZ"
    , start "R" "RA", task "R" "RS", call "R" "RC" "C", finish "R" "RZ"
    , start "C" "CA", task "C" "CS", finish "C" "CZ" ]
    [ ("PA", "PR"), ("PR", "PF"), ("PF", "PT"), ("PT", "PX"), ("PX", "PJ"), ("PF", "PB"), ("PB", "PY")
    , ("PY", "PJ"), ("PJ", "PK"), ("PK", "PL"), ("PL", "PZ"), ("FA", "FP"), ("FP", "FV"), ("FV", "FZ")
    , ("RA", "RS"), ("RS", "RC"), ("RC", "RZ"), ("CA", "CS"), ("CS", "CZ") ]

def leaf (owner : String) : Body := serial owner ["T"]

/-- CALLN-ONCE-01: a fork straight into two Calls of one definition invokes it twice in one closure. -/
def forkIntoTwoCalls : CheckedProcess := forest [("P", forked "P" [["A"], ["A"]]), ("A", leaf "A")]
def forkIntoTwoCallsControl : CheckedProcess := forest [("P", forked "P" [["T", "A"], ["T", "A"]]), ("A", leaf "A")]

/-- CALLN-SHARED-01: two branches call one Call-bearing definition. -/
def sharedCallBearing : CheckedProcess :=
  forest [("P", forked "P" [["T", "A"], ["T", "A"]]), ("A", serial "A" ["T", "B"]), ("B", leaf "B")]
def sharedCallBearingControl : CheckedProcess :=
  forest [("P", serial "P" ["T", "A", "A"]), ("A", serial "A" ["T", "B"]), ("B", leaf "B")]

def callCycle : CheckedProcess :=
  forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "B"]), ("B", serial "B" ["T", "A"])]
def callCycleControl : CheckedProcess :=
  forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "B"]), ("B", leaf "B")]

def depthFour : CheckedProcess :=
  forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "B"]), ("B", serial "B" ["T", "D"]),
    ("D", serial "D" ["T", "G"]), ("G", leaf "G")]
def depthFourControl : CheckedProcess :=
  forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "B"]), ("B", serial "B" ["T", "D"]), ("D", leaf "D")]

def gatewayInCalledBody : CheckedProcess := forest [("P", serial "P" ["T", "A"]), ("A", forked "A" [["T"], ["T"]])]
def gatewayInCalledBodyControl : CheckedProcess := forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "T"])]

def fourCalledVertices : CheckedProcess := forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "T", "T", "T"])]
def fourCalledVerticesControl : CheckedProcess := forest [("P", serial "P" ["T", "A"]), ("A", serial "A" ["T", "T", "T"])]

/-- The entry Process runs Sub-Process `Q`, whose body calls `A`; the control calls `A` after `Q`. -/
def callInSubProcess : CheckedProcess :=
  build [("P", none), ("Q", some "P"), ("A", none)]
    [ start "P" "PS", sub "P" "Q", finish "P" "PE", start "Q" "QS", task "Q" "QV0", call "Q" "QV1" "A"
    , finish "Q" "QE", start "A" "AS", task "A" "AV0", finish "A" "AE" ]
    [ ("PS", "Q"), ("Q", "PE"), ("QS", "QV0"), ("QV0", "QV1"), ("QV1", "QE"), ("AS", "AV0"), ("AV0", "AE") ]
def callInSubProcessControl : CheckedProcess :=
  build [("P", none), ("Q", some "P"), ("A", none)]
    [ start "P" "PS", sub "P" "Q", call "P" "PC" "A", finish "P" "PE", start "Q" "QS", task "Q" "QV0"
    , finish "Q" "QE", start "A" "AS", task "A" "AV0", finish "A" "AE" ]
    [ ("PS", "Q"), ("Q", "PC"), ("PC", "PE"), ("QS", "QV0"), ("QV0", "QE"), ("AS", "AV0"), ("AV0", "AE") ]

def unreachedRoot : CheckedProcess :=
  forest [("P", serial "P" ["T", "A"]), ("A", leaf "A"), ("B", serial "B" ["T", "D"]), ("D", serial "D" ["T", "B"])]
def unreachedRootControl : CheckedProcess := forest [("P", serial "P" ["T", "A"]), ("A", leaf "A")]

/-- Completing `H`'s task ends `H`, `D` and `A` with three returns, then invokes `B` and its leading `G`
and arms `G`'s task: nine steps. The control's `B` leads with a task: eight. -/
def nineStepBurst : CheckedProcess :=
  forest [("P", serial "P" ["T", "A", "B"]), ("A", serial "A" ["T", "D"]), ("D", serial "D" ["T", "H"]),
    ("H", leaf "H"), ("B", serial "B" ["G"]), ("G", leaf "G")]
def nineStepBurstControl : CheckedProcess :=
  forest [("P", serial "P" ["T", "A", "B"]), ("A", serial "A" ["T", "D"]), ("D", serial "D" ["T", "H"]),
    ("H", leaf "H"), ("B", leaf "B")]

/-- The entry closure charges initiate, the fork and three steps per branch: eight, the closure bound. -/
def forkIntoLeadingCalls : CheckedProcess :=
  forest [("P", forked "P" [["A"], ["B"]]), ("A", serial "A" ["D"]), ("B", serial "B" ["G"]),
    ("D", serial "D" ["T"]), ("G", serial "G" ["T"])]

/-- One branch calls the leaf `A`, the other calls `B`, whose body calls `A`: two live `A` instances
whose callers are the entry root and `B`'s root. -/
def twoCallers : CheckedProcess :=
  forest [("P", forked "P" [["T", "A"], ["T", "B"]]), ("B", serial "B" ["T", "A"]), ("A", leaf "A")]

/-- Completes the open User Task `element` at `activation` in whichever instance holds it: one activation
counter per element spans every called instance (CALLN-IDENTITY-01), so the pair names one wait. -/
def completeOpen (state : RuntimeState) (element : String) (activation : Nat) : Stimulus :=
  let processInstanceId := match state.waits.find? fun wait =>
      wait.task.id.value == element && wait.activation == activation with
    | some wait => wait.processInstanceId
    | none => ⟨"I"⟩
  .completeUserTaskInstance ⟨element ++ "#" ++ toString activation⟩
    { processInstanceId, elementId := ⟨element⟩, activation } []

/-- The committed result after starting `source` and completing `tasks` in order; a rejected step stops. -/
def journey (source : CheckedProcess) (tasks : List (String × Nat)) : StimulusResult :=
  let program := lowerCheckedProcess source
  tasks.foldl (fun result (element, activation) =>
      if result.outcome == .committed then
        applyStimulus scenarioClosureLimit program result.state (completeOpen result.state element activation)
      else result)
    (applyStimulus scenarioClosureLimit program initialState (.startProcess ⟨"start"⟩ ⟨"P"⟩ ⟨"I"⟩ []))

/-- The open User Tasks as element and activation; `none` when a step did not commit or the state
is unstable. -/
def openTasks (source : CheckedProcess) (tasks : List (String × Nat)) : Option (List (String × Nat)) :=
  let result := journey source tasks
  if result.outcome == .committed then
    (observeStableState (lowerCheckedProcess source) result.state).map
      (·.openUserTasks.map fun task => (task.id.elementId.value, task.id.activation))
  else none

def completed (source : CheckedProcess) (tasks : List (String × Nat)) : Bool :=
  let result := journey source tasks
  result.outcome == .committed && result.state.control == .completed ⟨"I"⟩

/-- Everything one called instance owns: the records naming it as called, its scopes, waits and tokens. -/
def instanceSlice (state : RuntimeState) (target : SemanticId) :=
  (state.calledProcessOccurrences.filter (·.calledRoot.processInstanceId == target),
    state.scopeOccurrences.filter (·.id.processInstanceId == target),
    state.waits.filter (·.processInstanceId == target),
    state.tokens.filter (·.owner.processInstanceId == target))

/-- The called instance the entry Process's Call `element` created at `activation`. -/
def calledInstance (element : String) (activation : Nat) : SemanticId :=
  deriveCalledProcessInstanceId ⟨"I"⟩ ⟨element⟩ activation

/-- Both `A` instances of `twoCallers` live, with the one `B` calls made quiescent by withdrawing its task
wait: the mid-closure state just before its return fires. -/
def twoLiveInstances : RuntimeState :=
  let state := (journey twoCallers [("PB0V0", 1), ("PB1V0", 1), ("BV0", 1)]).state
  { state with waits := state.waits.filter fun wait => !(wait.task.id.value == "AV0" && wait.activation == 2) }

/-- The lowered return of `twoCallers`' Call `element`. -/
def returnOf (element : String) : Option SemanticOperation :=
  (lowerCheckedProcess twoCallers).operations.find? fun operation => match operation with
    | .returnProcess _ origin .. => origin.elementId.value == element
    | _ => false

end BpmnSemantics.RepeatedNestedConcurrentCallsConformance
