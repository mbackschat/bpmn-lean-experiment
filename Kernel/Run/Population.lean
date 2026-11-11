module

public import Kernel.Population
public import Kernel.IL.Codec.Stimulus
public import Kernel.Run.Wire

/-! # Kernel runner: population scenarios

Reads a [population scenario](../../contracts/schemas/engine-population-scenario.schema.json) into the population's
stimuli and renders the [engine-population result](../../contracts/schemas/engine-population-result.schema.json).
`Kernel.Run` reads the files and runs the stimuli, because it is the one module that may import both registries. A
malformed population scenario is a harness error, three of them with stable codes: `population-time-backward`,
`population-time-mismatch` and `population-unknown-definition`.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. -/
def definitionRefFromJson (resource : Json) (profile : String) : Except String Population.DeploymentRef := do
  let overlay ← match ← resource.getObjVal? "sourceOverlay" with
    | .null => pure none
    | overlay =>
      pure (some { id := ← overlay.getObjValAs? String "id", sha256 := ← overlay.getObjValAs? String "sha256" })
  pure { sourceId := ← resource.getObjValAs? String "id", sourceSha256 := ← resource.getObjValAs? String "sha256"
         overlay, profile }

/-- An instance step names its instance and definition; every step of one instance names the same definition. -/
structure Script where
  instanceId : String
  definitionRef : String

/-- A scenario definition with the program the harness compiled for it. -/
structure Declared where
  definitionRef : String
  ref : Population.DeploymentRef
  program : Program

/-- A malformed population scenario: a harness refusal with its stable code (contract §2.2, §7). -/
def harnessRefusal {α : Type} (code detail : String) : Except String α :=
  throw s!"{code}: {detail}"

def declaredOf (declared : List Declared) (definitionRef : String) : Except String Declared :=
  match declared.find? (·.definitionRef == definitionRef) with
  | some entry => pure entry
  | none => harnessRefusal "population-unknown-definition" definitionRef

def optional (json : Json) (key : String) : Option Json :=
  (json.getObjVal? key).toOption

/-- A command's optional business key. -/
def businessKeyOf (json : Json) : Except String (Option String) :=
  match optional json "businessKey" with
  | none => pure none
  | some _ => some <$> json.getObjValAs? String "businessKey"

/-- `{processKey}` names a key's current deployment, `{deploymentId}` one deployment; absent, no definition. -/
def selectorFromJson : Option Json → Except String (Option Population.DefinitionSelector)
  | none => pure none
  | some json =>
    match optional json "processKey" with
    | some _ => (some ∘ .processKey) <$> json.getObjValAs? String "processKey"
    | none => (some ∘ .deployment) <$> json.getObjValAs? Nat "deploymentId"

/-- A discovery order's entry: `{kind: "occurrence", occurrence}` or `{kind: "start", deploymentId, startEvent}`. -/
def receiverFromJson (json : Json) : Except String Population.Receiver := do
  match ← json.getObjValAs? String "kind" with
  | "occurrence" => .occurrence <$> Codec.occurrenceFromJson (← json.getObjVal? "occurrence")
  | "start" => pure (.start (← json.getObjValAs? Nat "deploymentId") (← json.getObjValAs? String "startEvent"))
  | other => throw s!"unknown receiver kind {other}"

def orderFromJson (json : Json) : Except String (Option (List Population.Receiver)) := do
  match optional json "order" with
  | none => pure none
  | some _ => some <$> (← json.getObjValAs? (Array Json) "order").toList.mapM receiverFromJson

def publishModeFromJson : String → Except String Population.PublishMode
  | "any" => pure .any
  | "executionsOnly" => pure .executionsOnly
  | "startOnly" => pure .startOnly
  | other => throw s!"unknown publication mode {other}"

def publicationFromJson (json : Json) : Except String Population.Publication := do
  let address ← json.getObjVal? "address"
  let message : Population.MessageAddress ← match optional address "channel", optional address "name" with
    | some channel, none => .channel <$> Codec.channelFromJson channel
    | none, some _ => .name <$> address.getObjValAs? String "name"
    | _, _ => throw "a publication names a channel or a name"
  pure { commandId := ← json.getObjValAs? String "commandId"
         definition := ← selectorFromJson (optional address "definition")
         message
         criteria := ← (← json.getObjValAs? (Array Json) "criteria").toList.mapM Codec.correlationFromJson
         payload := ← (optional json "payload").mapM Codec.valueAt
         variables := ← Codec.bindingsAt json "variables"
         businessKey := ← businessKeyOf json
         mode := ← publishModeFromJson (← json.getObjValAs? String "mode") }

/-- A population command step, or `none` for another step kind. -/
def commandFromJson (json : Json) : String → Except String (Option Population.Command)
  | "publish" => (some ∘ .publish) <$> publicationFromJson json
  | "broadcast" => do
    pure (some (.broadcast { commandId := ← json.getObjValAs? String "commandId"
                             address := ← Codec.signalAddressFromJson (← json.getObjVal? "address")
                             variables := ← Codec.bindingsAt json "variables", order := ← orderFromJson json }))
  | "evaluateConditions" => do
    pure (some (.evaluateConditions { commandId := ← json.getObjValAs? String "commandId"
                                      definition := ← selectorFromJson (optional json "definition")
                                      variables := ← Codec.bindingsAt json "variables"
                                      businessKey := ← businessKeyOf json
                                      order := ← orderFromJson json }))
  | "timerStart" => do
    pure (some (.timerStart { commandId := ← json.getObjValAs? String "commandId"
                              deploymentId := ← json.getObjValAs? Nat "deploymentId"
                              startEvent := ← json.getObjValAs? String "startEvent"
                              dueMs := ← json.getObjValAs? Nat "dueMs" }))
  | _ => pure none

/-- An instance step's input. Its stimulus keeps its own `at`, which must equal the step's when both are given; a step
`at` the stimulus lacks becomes the input's. -/
def instanceInput (stimulus : Json) (stepAt : Option Nat) : Except String (String × Input) :=
  match stepAt, optional stimulus "at" with
  | some stepAt, some own =>
    if (own.getNat?).toOption == some stepAt then Codec.stimulusFromJson stimulus
    else harnessRefusal "population-time-mismatch" s!"stimulus at {own.compress}, step at {stepAt}"
  | some stepAt, none => Codec.stimulusFromJson (stimulus.setObjVal! "at" (toJson stepAt))
  | none, _ => Codec.stimulusFromJson stimulus

/-- An instance step, with the scripts seen so far: an instance's start must name the step's instance. -/
def instanceStimulus (declared : List Declared) (scripts : List Script) (json : Json) (stepAt : Option Nat) :
    Except String (List Script × Population.Stimulus) := do
  let script : Script :=
    { instanceId := ← json.getObjValAs? String "instanceId", definitionRef := ← json.getObjValAs? String "definitionRef" }
  discard <| declaredOf declared script.definitionRef
  let stimulus ← json.getObjVal? "stimulus"
  if (stimulus.getObjValAs? String "kind").toOption == some "start" then
    let started ← stimulus.getObjValAs? String "instanceId"
    unless started == script.instanceId do throw s!"step of {script.instanceId} starts {started}"
  let (commandId, input) ← instanceInput stimulus stepAt
  match scripts.findIdx? (·.instanceId == script.instanceId) with
  | some index =>
    unless (scripts[index]?.map (·.definitionRef)) == some script.definitionRef do
      throw s!"instance {script.instanceId} names two definitions"
    pure (scripts, .input index script.definitionRef commandId input)
  | none => pure (scripts ++ [script], .input scripts.length script.definitionRef commandId input)

/-- The population's stimuli, in scenario order: the definitions no `deploy` step names deploy at 0 in list order,
then every step at its logical time, which a step gives as `at` or inherits from the step before (0 for the first) and
which never decreases. `digests` holds each step's digest of its canonical wire form, which the harness computes. -/
def stimuliOfPopulation (declared : List Declared) (steps : List Json) (digests : List String) :
    Except String (List Population.Stimulus) := do
  unless digests.length == steps.length do throw s!"{steps.length} steps, {digests.length} digests"
  let mut deployedByStep : List String := []
  for json in steps do
    if (← json.getObjValAs? String "kind") == "deploy" then
      deployedByStep := deployedByStep ++ [(← declaredOf declared (← json.getObjValAs? String "definitionRef")).definitionRef]
  let mut stimuli : List Population.Stimulus := (declared.filter fun entry => !deployedByStep.contains entry.definitionRef).map
    fun entry => .deploy entry.definitionRef entry.ref entry.program 0
  let mut scripts : List Script := []
  let mut clock := 0
  for (json, index) in steps.zipIdx do
    let stepAt ← match optional json "at" with
      | none => pure none
      | some _ => some <$> json.getObjValAs? Nat "at"
    if let some stepAt := stepAt then
      if stepAt < clock then harnessRefusal "population-time-backward" s!"step {index} at {stepAt} after {clock}"
      clock := stepAt
    match ← json.getObjValAs? String "kind" with
    | "deploy" =>
      let entry ← declaredOf declared (← json.getObjValAs? String "definitionRef")
      stimuli := stimuli ++ [.deploy entry.definitionRef entry.ref entry.program clock]
    | "instance" =>
      let (known, stimulus) ← instanceStimulus declared scripts json stepAt
      scripts := known
      stimuli := stimuli ++ [stimulus]
    | kind =>
      match ← commandFromJson json kind with
      | some command => stimuli := stimuli ++ [.command command clock (digests.getD index "")]
      | none => throw s!"unsupported population step {kind}"
  pure stimuli

def failureFields (failure : Failure) : List (String × Json) :=
  [("outcome", Json.str (Codec.failureName failure)), ("code", Json.str (Codec.failureCode failure))]

def receiverJson : Population.Receiver → Json
  | .occurrence ref => Json.mkObj [("kind", "occurrence"), ("occurrence", referenceJson ref)]
  | .start deploymentId startEvent =>
    Json.mkObj [("kind", "start"), ("deploymentId", toJson deploymentId), ("startEvent", Json.str startEvent)]

def fanOutEntryJson : Population.FanOutEntry → Json
  | .delivered target => Json.mkObj [("kind", "delivered"), ("target", referenceJson target)]
  | .started instanceId deploymentId version startEvent =>
    Json.mkObj [("kind", "started"), ("instanceId", Json.str instanceId), ("deploymentId", toJson deploymentId),
      ("version", toJson version), ("startEvent", Json.str startEvent)]
  | .skipped target => Json.mkObj [("kind", "skipped"), ("target", referenceJson target)]
  | .failed target failure =>
    Json.mkObj ([("kind", Json.str "failed"), ("target", receiverJson target)] ++ failureFields failure)

def resolutionJson : Population.Resolution → Json
  | .committed target => Json.mkObj [("kind", "committed"), ("target", referenceJson target)]
  | .failed target failure =>
    Json.mkObj ([("kind", Json.str "failed"), ("target", referenceJson target)] ++ failureFields failure)
  | .fanOut entries => Json.mkObj [("kind", "fanOut"), ("entries", Json.arr (entries.map fanOutEntryJson).toArray)]
  | .noMatch => Json.mkObj [("kind", "noMatch")]
  | .ambiguous => Json.mkObj [("kind", "ambiguous")]
  | .rejected code => Json.mkObj [("kind", "rejected"), ("code", Json.str code)]
  | .unsupported code => Json.mkObj [("kind", "unsupported"), ("code", Json.str code)]

def deploymentResultJson (deployment : Population.DeploymentResult) : Json :=
  let outcome := match deployment.outcome with
    | .deployed => Json.mkObj [("kind", "deployed")]
    | .refused code => Json.mkObj [("kind", "deploymentRefused"), ("code", Json.str code)]
  Json.mkObj [("deploymentId", toJson deployment.deploymentId), ("definitionRef", Json.str deployment.definitionRef),
    ("versions", Json.arr (deployment.versions.map fun (key, version) =>
      Json.mkObj [("key", Json.str key), ("version", toJson version)]).toArray),
    ("outcome", outcome)]

/-- The result document; `observe` renders an instance's state as the canonical result's state observation. -/
def populationResultJson (observe : Program → State → Json) (scenarioId : String) (result : Population.Result) : Json :=
  let inputFailures := if result.inputFailures.isEmpty then [] else
    [("inputFailures", Json.arr (result.inputFailures.map fun (commandId, failure) =>
      Json.mkObj ([("commandId", Json.str commandId)] ++ failureFields failure)).toArray)]
  let fields : List (String × Json) := [("kind", "enginePopulationResult"), ("scenarioId", Json.str scenarioId),
    ("deployments", Json.arr (result.deployments.map deploymentResultJson).toArray),
    ("steps", Json.arr (result.steps.map fun stepped =>
      Json.mkObj [("commandId", Json.str stepped.commandId), ("ordinal", toJson stepped.ordinal),
        ("at", toJson stepped.atMs), ("resolution", resolutionJson stepped.resolution)]).toArray),
    ("processStates", Json.arr (result.instances.map fun member =>
      observe member.deployment.program member.state).toArray)]
  Json.mkObj (inputFailures ++ fields)

end Kernel.Run
