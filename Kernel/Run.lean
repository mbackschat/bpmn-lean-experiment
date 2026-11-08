module

public import Kernel.Step
public import Kernel.Publish
public import Kernel.Registry
public import Kernel.AdmissionRegistry
public import Kernel.IL.Codec

/-! # Kernel scenario runner

`kernelRun <program.json> <scenario.json>` prints the canonical scenario result. Trace rules, as the frozen
evaluator applies them: a committed input, or a rejected one that is not last, adds its command and state
observation and the run continues; any other outcome adds them and ends the run with that outcome. A program the
admission registry refuses yields only an unsupported deployment.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

def taskRefJson (ref : Publish.TaskRef) : Json :=
  Json.mkObj [("processInstanceId", Json.str ref.processInstanceId), ("elementId", Json.str ref.elementId),
    ("activation", toJson ref.activation)]

/-- `metadata` appears only for a task with candidate groups, and `form` within it only with form fields. -/
def openUserTaskJson (task : Publish.OpenUserTask) : Json :=
  let base := [("id", taskRefJson task.id),
    ("name", match task.name with | some name => Json.str name | none => Json.null), ("state", Json.str "active")]
  let form := if task.formFields.isEmpty then [] else
    [("form", Json.mkObj [("fields", Json.arr (task.formFields.map fun (key, type) =>
      Json.mkObj [("key", Json.str key), ("type", Json.str type)]).toArray)])]
  let metadata := if task.candidateGroups.isEmpty then [] else
    [("metadata", Json.mkObj ([("assignment", Json.mkObj [("candidates", Json.arr (task.candidateGroups.map fun group =>
      Json.mkObj [("id", Json.str group), ("kind", Json.str "group")]).toArray)])] ++ form))]
  Json.mkObj (base ++ metadata)

def observationJson (state : State) : Json :=
  let o := Publish.observe state
  Json.mkObj [
    ("kind", "state"), ("instanceId", Json.str o.instanceId), ("status", Json.str o.status),
    ("activeWaits", Json.arr (o.activeWaits.map fun wait => Json.mkObj [("elementId", Json.str wait.elementId),
      ("kind", Json.str wait.kind), ("multiplicity", toJson wait.multiplicity)]).toArray),
    ("openUserTasks", Json.arr (o.openUserTasks.map openUserTaskJson).toArray),
    ("openMessageSubscriptions", Json.arr #[]), ("openTimers", Json.arr #[]), ("openEffects", Json.arr #[]),
    ("openIncidents", Json.arr #[]),
    ("variables", Codec.bindingsToJson o.variables),
    ("enabledInteractions", Json.arr (o.enabledInteractions.map fun interaction => Json.mkObj [
      ("kind", Json.str interaction.kind), ("taskId", taskRefJson interaction.taskId)]).toArray),
    ("logicalTimeMs", toJson o.logicalTimeMs)]

def commandJson (commandId outcome : String) : Json :=
  Json.mkObj [("kind", "command"), ("commandId", Json.str commandId), ("outcome", Json.str outcome)]

def snapshot (state : Option State) : List Json :=
  match state with
  | some state => [observationJson state]
  | none => []

/-- The trace after deployment and the scenario outcome. -/
def execute (program : Program) : Option State → List (String × Option Input) → List Json × String
  | _, [] => ([], "committed")
  | state, (commandId, input) :: rest =>
    let result : Outcome :=
      match input with
      | some input => Step.step Registry.hooks program state input
      | none => .error (.unsupported "stimulus")
    match result with
    | .ok next =>
      let (trace, outcome) := execute program (some next) rest
      (commandJson commandId "committed" :: snapshot (some next) ++ trace, outcome)
    | .error failure =>
      let name := Codec.failureName failure
      let observed := commandJson commandId name :: snapshot state
      match failure, rest with
      | .rejected _, _ :: _ =>
        let (trace, outcome) := execute program state rest
        (observed ++ trace, outcome)
      | _, _ => (observed, name)

def result (program : Program) (stimuli : List (String × Option Input)) : Json :=
  let deployment (outcome : String) := Json.mkObj [("kind", "deployment"), ("outcome", Json.str outcome)]
  let semantic (outcome : String) := Json.mkObj [("kind", "semantic"), ("outcome", Json.str outcome)]
  match AdmissionRegistry.admit program with
  | some _ => Json.mkObj [("outcome", semantic "unsupported"), ("trace", Json.arr #[deployment "unsupported"])]
  | none =>
    let (trace, outcome) := execute program none stimuli
    Json.mkObj [("outcome", semantic outcome), ("trace", Json.arr (deployment "committed" :: trace).toArray)]

def readJson (path : String) : IO Json := do
  match Json.parse (← IO.FS.readFile path) with
  | .ok json => pure json
  | .error message => throw (IO.userError s!"{path}: {message}")

def orFail {α : Type} (path : String) : Except String α → IO α
  | .ok value => pure value
  | .error message => throw (IO.userError s!"{path}: {message}")

def run (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Lean.fromJson? (α := Program) (← readJson programPath))
  if let some code := AdmissionRegistry.admit program then IO.eprintln s!"admission refused: {code}"
  let scenario ← readJson scenarioPath
  let stimuli ← orFail scenarioPath do
    let items ← scenario.getObjValAs? (Array Json) "stimuli"
    items.toList.mapM Codec.stimulusFromJson
  pure (result program stimuli)

end Kernel.Run

def main (args : List String) : IO UInt32 := do
  match args with
  | [programPath, scenarioPath] =>
    IO.println (← Kernel.Run.run programPath scenarioPath).compress
    pure 0
  | _ =>
    IO.eprintln "usage: kernelRun <program.json> <scenario.json>"
    pure 64
