module

public import Kernel.Step
public import Kernel.Publish
public import Kernel.Host
public import Kernel.Population
public import Kernel.Registry
public import Kernel.AdmissionRegistry
public import Kernel.IL.Codec
public import Kernel.IL.Codec.Stimulus

/-! # Kernel scenario runner

`kernelRun <program.json> <scenario.json>` prints the [canonical result](../contracts/schemas/canonical-result.schema.json).
Trace rules: a committed input, or a rejected one that is not last, adds its command and state observation and the run
continues; any other outcome adds them and ends the run with that outcome. A program the admission registry refuses
yields only an unsupported deployment carrying the refusal code. A command observation of an input that did not commit
carries the failure's code.

A state observation's open waits are `Kernel.Host.hostView`'s, in the schema's canonical order: process instance,
element, activation, then detail kind, so the order an implementation opens them in is never published.

`kernelRun --host-view <program.json> <scenario.json>` prints `{result, hostRequirements, definitionCapabilities,
hostViews}`, one host view per committed input.

`kernelRun --population <program.json>... <population-scenario.json>` prints the engine-population result for a
[population scenario](../contracts/schemas/engine-population-scenario.schema.json), one program per scenario definition
in the same order. The population mode lives here because this is the one module that may import both registries; a
refused program or a population refusal is a harness error, never a result.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

/-- An already public reference (`Host.publicRef`, `Population.occurrence`): the schema's `occurrenceId`. -/
def referenceJson (ref : OccurrenceRef) : Json :=
  Json.mkObj [("processInstanceId", Json.str ref.processInstanceId), ("elementId", Json.str ref.element.value),
    ("activation", toJson ref.activation)]

/-- A present value, or JSON null: the schema's nullable members. -/
def nullable {α : Type} (value : Option α) (encode : α → Json) : Json :=
  match value with
  | some value => encode value
  | none => Json.null

def inputTagName : InputTag → String
  | .start => "start"
  | .command => "command"
  | .deliver => "deliver"
  | .timerFire => "timerFire"
  | .effectResult => "effectResult"

def definitionRefJson (ref : DefinitionRef) : Json :=
  Json.mkObj [("key", Json.str ref.key), ("version", nullable ref.version toJson),
    ("versionTag", nullable ref.versionTag Json.str), ("deployment", nullable ref.deployment Json.str),
    ("tenant", nullable ref.tenant Json.str), ("sourceSha256", nullable ref.sourceSha256 Json.str)]

def effectFields (effect : EffectDetail) : List (String × Json) :=
  [("protocol", Json.str effect.protocol), ("operation", Json.str effect.operation),
    ("arguments", Codec.bindingsToJson effect.arguments), ("failures", toJson effect.failures),
    ("send", nullable effect.send fun send => Json.mkObj [("recipient", nullable send.recipient Json.str),
      ("correlation", Codec.bindingsToJson send.correlation)])]

def userTaskFields (task : UserTaskDetail) : List (String × Json) :=
  [("name", nullable task.name Json.str), ("assignee", nullable task.assignee Json.str),
    ("candidateUsers", toJson task.candidateUsers), ("candidateGroups", toJson task.candidateGroups),
    ("formKey", nullable task.formKey Json.str),
    ("formFields", Json.arr (task.formFields.map fun (key, type) =>
      Json.mkObj [("key", Json.str key), ("type", Json.str type)]).toArray),
    ("dueDate", nullable task.dueDate Json.str), ("followUpDate", nullable task.followUpDate Json.str),
    ("priority", nullable task.priority toJson), ("inputs", Codec.bindingsToJson task.inputs)]

/-- A wait's detail kind and fields, read from the one view field its kind sets (`OpenKind.view`). -/
def detail (view : WaitView) : Option (String × List (String × Json)) :=
  (view.userTask.map fun task => ("userTask", userTaskFields task)) <|>
  (view.incident.map fun incident => ("incident", [("effect", Json.mkObj (effectFields incident.effect)),
    ("generation", toJson incident.generation), ("cancellable", toJson incident.cancellable)])) <|>
  (view.effect.map fun effect => ("effect", effectFields effect)) <|>
  (view.signal.map fun signal => ("signal", [("name", Json.str signal.name), ("payload", toJson signal.payload)])) <|>
  (view.conditional.map fun condition => ("conditional", [("variableName", nullable condition.variableName Json.str),
    ("variableEvents", toJson condition.variableEvents), ("lastValue", nullable condition.lastValue toJson)])) <|>
  (view.deadlineMs.map fun deadline => ("timer", [("deadlineMs", toJson deadline),
    ("recurrence", nullable view.recurrence fun recurrence => Json.mkObj [
      ("periodMs", nullable recurrence.periodMs toJson), ("cron", nullable recurrence.cron Json.str),
      ("remaining", nullable recurrence.remaining toJson)])])) <|>
  (view.channel.map fun channel => ("message", [("channel", Codec.channelToJson channel),
    ("payload", toJson view.payload), ("criteria", toJson view.criteria)]))

/-- One rendered open wait with the key of the canonical order. -/
structure PublishedWait where
  id : OccurrenceRef
  kind : String
  json : Json

def openWait (wait : Host.OpenWait) : PublishedWait :=
  -- Every view sets exactly one detail field, so the empty fallback never renders.
  let (kind, fields) := (detail wait.view).getD ("", [])
  { id := wait.id, kind
    json := Json.mkObj [("id", referenceJson wait.id), ("definition", nullable wait.definition definitionRefJson),
      ("input", nullable wait.view.input fun tag => Json.str (inputTagName tag)),
      ("detail", Json.mkObj (("kind", Json.str kind) :: fields))] }

/-- The schema's canonical order: process instance, element (both in `String` order), activation, detail kind. -/
def PublishedWait.le (left right : PublishedWait) : Bool :=
  let (l, r) := (left.id, right.id)
  decide (l.processInstanceId < r.processInstanceId) || (l.processInstanceId == r.processInstanceId &&
    (decide (l.element.value < r.element.value) || (l.element.value == r.element.value &&
      (l.activation < r.activation || (l.activation == r.activation && decide (left.kind ≤ right.kind))))))

def failureJson (failure : InstanceFailure) : Json :=
  Json.mkObj [("code", Json.str failure.code), ("message", nullable failure.message Json.str),
    ("occurrence", referenceJson failure.occurrence),
    ("related", Json.arr (failure.related.map fun (name, ref) =>
      Json.mkObj [("name", Json.str name), ("occurrence", referenceJson ref)]).toArray)]

def scopeJson (scope : Publish.PublishedScope) : Json :=
  let place : List (String × Json) := match scope.element with
    | some element => [("elementId", Json.str element.value), ("activation", toJson scope.activation)]
    | none => []
  Json.mkObj [("scope", Json.mkObj ([("processInstanceId", Json.str scope.processInstanceId),
      ("role", Json.str (Publish.scopeRoleName scope.role))] ++ place)),
    ("variables", Codec.bindingsToJson scope.variables)]

/-- The state observation; `failure` appears only in a failed state. -/
def observationJson (program : Program) (state : State) : Json :=
  let view := Host.hostView program state
  let waits := (view.openWaits.map openWait).mergeSort PublishedWait.le
  let fields : List (String × Json) := [("kind", "state"), ("instanceId", Json.str state.instanceId),
    ("status", Json.str (Publish.statusName view.status)), ("logicalTimeMs", toJson state.logicalTimeMs),
    ("variables", Codec.bindingsToJson (Publish.variables state)),
    ("scopes", Json.arr ((Publish.scopes program state).map scopeJson).toArray),
    ("openWaits", Json.arr (waits.map (·.json)).toArray)]
  Json.mkObj (fields ++
    (view.failure.map fun failure => ("failure", failureJson failure)).toList)

/-- `code` appears only on an input that did not commit. -/
def commandJson (commandId outcome : String) (code : Option String) : Json :=
  let fields : List (String × Json) := [("kind", "command"), ("commandId", Json.str commandId),
    ("outcome", Json.str outcome)]
  Json.mkObj (fields ++
    code.toList.map fun code => ("code", Json.str code))

def snapshot (program : Program) (state : Option State) : List Json :=
  state.toList.map (observationJson program)

/-- The trace after deployment and the scenario outcome. -/
def execute (program : Program) : Option State → List (String × Input) → List Json × String
  | _, [] => ([], "committed")
  | state, (commandId, input) :: rest =>
    match Step.step Registry.hooks program state input with
    | .ok next =>
      let (trace, outcome) := execute program (some next) rest
      (commandJson commandId "committed" none :: snapshot program (some next) ++ trace, outcome)
    | .error failure =>
      let name := Codec.failureName failure
      let observed := commandJson commandId name (some (Codec.failureCode failure)) :: snapshot program state
      match failure, rest with
      | .rejected _, _ :: _ =>
        let (trace, outcome) := execute program state rest
        (observed ++ trace, outcome)
      | _, _ => (observed, name)

/-- `code` appears only on a refused deployment. -/
def deploymentJson (outcome : String) (code : Option String) : Json :=
  let fields : List (String × Json) := [("kind", "deployment"), ("outcome", Json.str outcome)]
  Json.mkObj (fields ++ code.toList.map fun code => ("code", Json.str code))

def result (program : Program) (stimuli : List (String × Input)) : Json :=
  let semantic (outcome : String) := Json.mkObj [("kind", "semantic"), ("outcome", Json.str outcome)]
  match AdmissionRegistry.admit program with
  | some code =>
    Json.mkObj [("outcome", semantic "unsupported"), ("trace", Json.arr #[deploymentJson "unsupported" (some code)])]
  | none =>
    let (trace, outcome) := execute program none stimuli
    Json.mkObj [("outcome", semantic outcome), ("trace", Json.arr (deploymentJson "committed" none :: trace).toArray)]

def readJson (path : String) : IO Json := do
  match Codec.parseStrict (← IO.FS.readFile path) with
  | .ok json => pure json
  | .error message => throw (IO.userError s!"{path}: {message}")

def orFail {α : Type} (path : String) : Except String α → IO α
  | .ok value => pure value
  | .error message => throw (IO.userError s!"{path}: {message}")

/-- A scenario's BPMN resource (`{id, sha256, sourceOverlay}`) under the scenario's profile. -/
def definitionRefFromJson (resource : Json) (profile : String) : Except String Population.DeploymentRef := do
  let overlay ← match ← resource.getObjVal? "sourceOverlay" with
    | .null => pure none
    | overlay =>
      pure (some { id := ← overlay.getObjValAs? String "id", sha256 := ← overlay.getObjValAs? String "sha256" })
  pure { sourceId := ← resource.getObjValAs? String "id", sourceSha256 := ← resource.getObjValAs? String "sha256"
         overlay, profile }

def stimuliFromJson (json : Json) : Except String (List (String × Input)) := do
  (← json.getObjValAs? (Array Json) "stimuli").toList.mapM Codec.stimulusFromJson

def run (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
  if let some code := AdmissionRegistry.admit program then IO.eprintln s!"admission refused: {code}"
  let stimuli ← orFail scenarioPath (stimuliFromJson (← readJson scenarioPath))
  pure (result program stimuli)

/-! ## Host-view mode -/

def roleName : ActivationRole → String
  | .element => "element"
  | .multiInstanceBody => "multiInstanceBody"

def keyJson (key : OccurrenceKey) : Json :=
  Json.mkObj [("processInstanceId", Json.str key.processInstanceId), ("elementId", Json.str key.element.value),
    ("activation", toJson key.activation), ("role", Json.str (roleName key.role))]

def terminalName : Terminal → String
  | .completed => "completed"
  | .cancelled => "cancelled"

def causeJson : Cause → Json
  | .input tag => Json.mkObj [("kind", "input"), ("input", Json.str (inputTagName tag))]
  | .signal name => Json.mkObj [("kind", "signal"), ("signal", Json.str name)]
  | .arrive flow => Json.mkObj [("kind", "arrive"), ("flow", Json.str flow.value)]
  | .idle scope => Json.mkObj [("kind", "idle"), ("scope", toJson scope.value)]

def transitionJson (transition : Transition) : Json :=
  Json.mkObj [("cause", causeJson transition.cause),
    ("element", match transition.element with | some element => Json.str element.value | none => Json.null),
    ("owner", toJson transition.owner.value),
    ("started", Json.arr (transition.started.map fun fact =>
      Json.mkObj [("occurrence", keyJson fact.occurrence), ("owner", toJson fact.owner.value),
        ("sourceType", Json.str fact.sourceType)]).toArray),
    ("ended", Json.arr (transition.ended.map fun (key, terminal) =>
      Json.mkObj [("occurrence", keyJson key), ("terminal", Json.str (terminalName terminal))]).toArray)]

def waitJson (wait : Host.OpenWait) : Json :=
  let view := wait.view
  let optional {α : Type} (name : String) (value : Option α) (encode : α → Json) : List (String × Json) :=
    (value.map fun value => (name, encode value)).toList
  Json.mkObj ([("id", referenceJson wait.id)] ++
    optional "definition" wait.definition toJson ++
    optional "input" view.input (fun tag => Json.str (inputTagName tag)) ++
    optional "deadlineMs" view.deadlineMs toJson ++
    optional "period" (view.recurrence.bind (·.periodMs)) toJson ++
    optional "channel" view.channel Codec.channelToJson ++
    (if view.criteria.isEmpty then [] else [("criteria", Json.arr (view.criteria.map Json.str).toArray)]) ++
    optional "effect" view.effect (fun effect => Json.mkObj [("protocol", Json.str effect.protocol),
      ("operation", Json.str effect.operation), ("arguments", Codec.bindingsToJson effect.arguments),
      ("failures", toJson effect.failures)]) ++
    optional "incident" view.incident (fun incident => Json.mkObj [("generation", toJson incident.generation),
      ("cancellable", toJson incident.cancellable)]) ++
    optional "userTask" view.userTask (fun task => Json.mkObj [
      ("name", match task.name with | some name => Json.str name | none => Json.null),
      ("inputs", Codec.bindingsToJson task.inputs)]))

def failureViewJson (failure : InstanceFailure) : Json :=
  Json.mkObj [("code", Json.str failure.code),
    ("message", match failure.message with | some message => Json.str message | none => Json.null),
    ("occurrence", referenceJson failure.occurrence),
    ("related", Json.mkObj (failure.related.map fun (name, ref) => (name, referenceJson ref)))]

def hostViewJson (view : Host.View) : Json :=
  Json.mkObj ([("status", Json.str (Publish.statusName view.status)),
    ("openWaits", Json.arr (view.openWaits.map waitJson).toArray),
    ("journal", Json.arr (view.journal.map transitionJson).toArray)] ++
    (view.failure.map fun failure => ("failure", failureViewJson failure)).toList)

/-- Every committed input's host view. -/
def hostViews (program : Program) : Option State → List (String × Input) → List Host.View
  | _, [] => []
  | state, (_, input) :: rest =>
    match Step.step Registry.hooks program state input with
    | .ok next => Host.hostView program next :: hostViews program (some next) rest
    | .error (.rejected _) => hostViews program state rest
    | .error _ => []

def requirementsJson (requirements : Host.Requirements) : Json :=
  Json.mkObj [("timers", toJson requirements.timers), ("messages", toJson requirements.messages),
    ("effects", toJson requirements.effects), ("userTasks", toJson requirements.userTasks),
    ("calls", toJson requirements.calls),
    ("maxConcurrentWaits", match requirements.maxConcurrentWaits with | some value => toJson value | none => Json.null)]

def capabilitiesJson (capabilities : Host.Capabilities) : Json :=
  Json.mkObj [("starts", Json.arr (capabilities.starts.map fun start =>
      Json.mkObj ([("startEventId", Json.str start.startEventId.value)] ++
        (start.channel.map fun channel => ("channel", Codec.channelToJson channel)).toList ++
        (start.timer.map fun schedule => ("timer", toJson schedule)).toList)).toArray),
    ("correlatedChannels", Json.arr (capabilities.correlatedChannels.map Codec.channelToJson).toArray),
    ("relations", Json.arr (capabilities.relations.map Json.str).toArray)]

def runHostView (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
  let stimuli ← orFail scenarioPath (stimuliFromJson (← readJson scenarioPath))
  let views := if (AdmissionRegistry.admit program).isSome then [] else hostViews program none stimuli
  pure (Json.mkObj [("result", result program stimuli),
    ("hostRequirements", requirementsJson (Host.hostRequirements program)),
    ("definitionCapabilities", capabilitiesJson (Host.definitionCapabilities program)),
    ("hostViews", Json.arr (views.map hostViewJson).toArray)])

/-! ## Population mode -/

/-- An instance step names its instance and definition; every step of one instance names the same definition. -/
structure Script where
  instanceId : String
  definitionRef : String

def definitionOf (definitions : List (String × Population.Definition)) (ref : String) :
    Except String Population.Definition := do
  let some (_, definition) := definitions.find? (·.1 == ref) | throw s!"unknown definition {ref}"
  pure definition

/-- A correlated publication: its address names a scenario definition by `definitionRef`. -/
def publicationFromJson (definitions : List (String × Population.Definition)) (json : Json) :
    Except String Population.Publication := do
  let address ← json.getObjVal? "address"
  let payload ← json.getObjVal? "payload"
  let payloadKind ← payload.getObjValAs? String "kind"
  unless payloadKind == "string" do throw s!"unknown publication payload kind {payloadKind}"
  pure { commandId := ← json.getObjValAs? String "commandId"
         address := { definition := (← definitionOf definitions (← address.getObjValAs? String "definitionRef")).ref
                      processId := ← address.getObjValAs? String "processId"
                      channel := ← Codec.channelFromJson (← address.getObjVal? "channel")
                      correlationKey := ← address.getObjValAs? String "correlationKeyId" }
         payload := ← payload.getObjValAs? String "value" }

/-- One population step, in scenario order, with the instances seen so far: an instance's start must name the step's
instance, and a broadcast, which the kernel's population does not implement, refuses the scenario. -/
def stepFromJson (definitions : List (String × Population.Definition)) (scripts : List Script) (json : Json) :
    Except String (List Script × Population.Stimulus) := do
  match ← json.getObjValAs? String "kind" with
  | "instance" =>
    let script : Script :=
      { instanceId := ← json.getObjValAs? String "instanceId", definitionRef := ← json.getObjValAs? String "definitionRef" }
    let stimulus ← json.getObjVal? "stimulus"
    if (stimulus.getObjValAs? String "kind").toOption == some "start" then
      let started ← stimulus.getObjValAs? String "instanceId"
      unless started == script.instanceId do throw s!"step of {script.instanceId} starts {started}"
    let (commandId, input) ← Codec.stimulusFromJson stimulus
    let definition ← definitionOf definitions script.definitionRef
    match scripts.findIdx? (·.instanceId == script.instanceId) with
    | some index =>
      unless (scripts[index]?.map (·.definitionRef)) == some script.definitionRef do
        throw s!"instance {script.instanceId} names two definitions"
      pure (scripts, .input index definition commandId input)
    | none => pure (scripts ++ [script], .input scripts.length definition commandId input)
  | "publish" => pure (scripts, .publish (← publicationFromJson definitions json))
  | other => throw s!"unsupported population step {other}"

def stepsFromJson (definitions : List (String × Population.Definition)) (steps : List Json) :
    Except String (List Population.Stimulus) := do
  let (_, stimuli) ← steps.foldlM (init := (([] : List Script), ([] : List Population.Stimulus)))
    fun (scripts, stimuli) json => do
      let (scripts, stimulus) ← stepFromJson definitions scripts json
      pure (scripts, stimuli ++ [stimulus])
  pure stimuli

def resolutionJson : Population.Resolution → Json
  | .committed target => Json.mkObj [("kind", "committed"), ("target", Json.mkObj [
      ("processInstanceId", Json.str target.processInstanceId),
      ("subscriptionId", referenceJson target)])]
  | .failed target failure => Json.mkObj [("kind", "failed"), ("outcome", Json.str (Codec.failureName failure)),
      ("code", Json.str (Codec.failureCode failure)), ("subscriptionId", referenceJson target)]
  | .noMatch => Json.mkObj [("kind", "rejectedNoMatch")]
  | .ambiguous => Json.mkObj [("kind", "rejectedAmbiguous")]

def populationResultJson (scenarioId : String) (result : Population.Result) : Json :=
  let ordinal (published : Population.PublicationResult) : List (String × Json) :=
    [("commandId", Json.str published.commandId), ("ingressOrdinal", toJson published.ingressOrdinal)]
  let inputFailures := if result.inputFailures.isEmpty then [] else
    [("inputFailures", Json.arr (result.inputFailures.map fun (commandId, failure) =>
      Json.mkObj [("commandId", Json.str commandId), ("outcome", Json.str (Codec.failureName failure)),
        ("code", Json.str (Codec.failureCode failure))]).toArray)]
  let fields : List (String × Json) := [("kind", "enginePopulationResult"), ("scenarioId", Json.str scenarioId),
    ("publicationResults", Json.arr (result.publications.map fun published =>
      Json.mkObj (ordinal published ++ [("outcome", resolutionJson published.resolution)])).toArray),
    ("processStates", Json.arr (result.instances.map fun member =>
      observationJson member.definition.program member.state).toArray),
    ("ingressOrdinals", Json.arr (result.publications.map fun published => Json.mkObj (ordinal published)).toArray)]
  Json.mkObj (inputFailures ++ fields)

def runPopulation (programPaths : List String) (scenarioPath : String) : IO Json := do
  let scenario ← readJson scenarioPath
  let (scenarioId, profile, resources) ← orFail scenarioPath do
    pure (← scenario.getObjValAs? String "id", ← scenario.getObjValAs? String "profile",
      (← scenario.getObjValAs? (Array Json) "definitions").toList)
  unless resources.length == programPaths.length do
    throw (IO.userError s!"{scenarioPath}: {resources.length} definitions, {programPaths.length} programs")
  let definitions ← (resources.zip programPaths).mapM fun (resource, programPath) => do
    let program ← orFail programPath (Codec.programFromJson (← readJson programPath))
    if let some code := AdmissionRegistry.admit program then
      throw (IO.userError s!"{programPath}: admission refused: {code}")
    let (id, ref) ← orFail scenarioPath do
      pure (← resource.getObjValAs? String "definitionRef", ← definitionRefFromJson (← resource.getObjVal? "bpmn") profile)
    unless program.identity.sourceSha256 == ref.sourceSha256 && program.identity.profile == profile do
      throw (IO.userError s!"{programPath}: program identity differs from definition {id}")
    pure (id, ({ ref, program } : Population.Definition))
  let stimuli ← orFail scenarioPath do stepsFromJson definitions (← scenario.getObjValAs? (Array Json) "steps").toList
  let result ← orFail scenarioPath (Population.run Registry.hooks (definitions.map (·.2)) stimuli)
  pure (populationResultJson scenarioId result)

end Kernel.Run

def main (args : List String) : IO UInt32 := do
  match args with
  | "--population" :: paths@(_ :: _ :: _) =>
    IO.println (← Kernel.Run.runPopulation paths.dropLast paths.getLast!).compress
    pure 0
  | ["--host-view", programPath, scenarioPath] =>
    IO.println (← Kernel.Run.runHostView programPath scenarioPath).compress
    pure 0
  | [programPath, scenarioPath] =>
    IO.println (← Kernel.Run.run programPath scenarioPath).compress
    pure 0
  | _ =>
    IO.eprintln ("usage: kernelRun <program.json> <scenario.json>\n" ++
      "       kernelRun --host-view <program.json> <scenario.json>\n" ++
      "       kernelRun --population <program.json>... <population-scenario.json>")
    pure 64
