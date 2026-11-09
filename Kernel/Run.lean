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

`kernelRun <program.json> <scenario.json>` prints the canonical scenario result. Trace rules: a committed input, or a
rejected one that is not last, adds its command and state observation and the run continues; any other outcome adds
them and ends the run with that outcome. A program the admission registry refuses yields only an unsupported
deployment carrying the refusal code.

`kernelRun --host-view <program.json> <scenario.json>` prints `{result, hostRequirements, definitionCapabilities,
hostViews}`, one host view per committed input.

`kernelRun --population <program.json>... <population-scenario.json>` prints the engine-population result
(`contracts/schemas/engine-population-scenario.schema.json`), one program per scenario definition in the same order.
The population mode lives here because this is the one module that may import both registries; a refused program
or a population refusal is a harness error, never a result.
-/

public section

namespace Kernel.Run

open Lean (Json toJson)

def occurrenceJson (id : Publish.OccurrenceId) : Json :=
  Json.mkObj [("processInstanceId", Json.str id.processInstanceId), ("elementId", Json.str id.elementId),
    ("activation", toJson id.activation)]

/-- `inputs` appears only for a task with input mappings, `metadata` only for a task with candidate groups, and
`form` within it only with form fields. -/
def openUserTaskJson (task : Publish.OpenUserTask) : Json :=
  let base := [("id", occurrenceJson task.id),
    ("name", match task.name with | some name => Json.str name | none => Json.null), ("state", Json.str "active")]
  let form := if task.formFields.isEmpty then [] else
    [("form", Json.mkObj [("fields", Json.arr (task.formFields.map fun (key, type) =>
      Json.mkObj [("key", Json.str key), ("type", Json.str type)]).toArray)])]
  let metadata := if task.candidateGroups.isEmpty then [] else
    [("metadata", Json.mkObj ([("assignment", Json.mkObj [("candidates", Json.arr (task.candidateGroups.map fun group =>
      Json.mkObj [("id", Json.str group), ("kind", Json.str "group")]).toArray)])] ++ form))]
  let inputs := if task.inputs.isEmpty then [] else [("inputs", Codec.bindingsToJson task.inputs)]
  Json.mkObj (base ++ inputs ++ metadata)

def openEffectJson (effect : Publish.OpenEffect) : Json :=
  Json.mkObj [("id", occurrenceJson effect.id),
    ("descriptor", Json.mkObj [("protocol", Json.str effect.protocol), ("operation", Json.str effect.operation)]),
    ("arguments", Codec.bindingsToJson effect.arguments)]

def incidentIdJson (effect : Publish.OccurrenceId) (generation : Nat) : Json :=
  Json.mkObj [("effectId", occurrenceJson effect), ("generation", toJson generation)]

/-- The compiler a correlated address's definition names. -/
def compiler : String := "bpmn-source-semantic-process"

def definitionJson (ref : Population.DeploymentRef) : Json :=
  Json.mkObj [("compiler", Json.str compiler), ("semanticProfile", Json.str ref.profile),
    ("sourceOverlay", match ref.overlay with
      | some overlay => Json.mkObj [("id", Json.str overlay.id), ("sha256", Json.str overlay.sha256)]
      | none => Json.null),
    ("sourceId", Json.str ref.sourceId), ("sourceSha256", Json.str ref.sourceSha256)]

def interactionJson (instanceId : String) (definition : Population.DeploymentRef) (processId : String) :
    Publish.EnabledInteraction → Json
  | .completeUserTask task => Json.mkObj [("kind", "completeUserTaskInstance"), ("taskId", occurrenceJson task)]
  | .deliverMessage subscription channel => Json.mkObj [("kind", "deliverMessage"),
      ("subscriptionId", occurrenceJson subscription), ("channel", Codec.channelToJson channel)]
  | .deliverPayloadMessage subscription channel => Json.mkObj [("kind", "deliverPayloadMessage"),
      ("subscriptionId", occurrenceJson subscription), ("channel", Codec.channelToJson channel)]
  | .publishCorrelatedPayloadMessage _ channel key => Json.mkObj [("kind", "publishCorrelatedPayloadMessage"),
      ("address", Json.mkObj [("definition", definitionJson definition), ("processId", Json.str processId),
        ("channel", Codec.channelToJson channel), ("correlationKeyId", Json.str key)])]
  | .retryIncident effect generation =>
    Json.mkObj [("kind", "retryIncident"), ("incidentId", incidentIdJson effect generation)]
  | .cancelIncidentProcess effect generation => Json.mkObj [("kind", "cancelIncidentProcess"),
      ("processInstanceId", Json.str instanceId), ("incidentId", incidentIdJson effect generation)]

def iterationJson (iteration : Publish.OpenIteration) : Json :=
  Json.mkObj [("loopCounter", toJson iteration.loopCounter), ("taskId", occurrenceJson iteration.taskId),
    ("taskInput", Json.mkObj [("name", Json.str iteration.taskInput.1),
      ("value", Codec.valueToJson iteration.taskInput.2)]),
    ("completionBindingName", Json.str iteration.completionBindingName)]

def multiInstanceJson (entry : Publish.OpenMultiInstance) : Json :=
  Json.mkObj [
    ("id", Json.mkObj [("processInstanceId", Json.str entry.processInstanceId),
      ("activityElementId", Json.str entry.activityElementId), ("activation", toJson entry.activation)]),
    ("mode", Json.str entry.mode.name), ("bodyKind", "userTask"),
    ("plannedInstanceCount", toJson entry.plannedInstanceCount), ("pendingItemCount", toJson entry.pendingItemCount),
    ("numberOfInstances", toJson entry.numberOfInstances),
    ("numberOfActiveInstances", toJson entry.numberOfActiveInstances),
    ("numberOfCompletedInstances", toJson entry.numberOfCompletedInstances),
    ("numberOfTerminatedInstances", toJson (0 : Nat)),
    ("activeIterations", Json.arr (entry.activeIterations.map iterationJson).toArray)]

/-- `openMultiInstances`, only for a program that publishes it (`Publish.publishesMultiInstances`). -/
def multiInstancesJson (program : Program) (state : State) : List (String × Json) :=
  if Publish.publishesMultiInstances program then
    [("openMultiInstances", Json.arr ((Publish.multiInstances program state).map multiInstanceJson).toArray)]
  else []

/-- `failure` appears only in a failed state. -/
def failureJson (failure : Publish.PublishedFailure) : String × Json :=
  ("failure", Json.mkObj [("kind", "compensationHandlerFailure"), ("triggerId", occurrenceJson failure.trigger),
    ("handlerId", occurrenceJson failure.handler), ("effectId", occurrenceJson failure.effect),
    ("code", Json.str failure.code),
    ("message", match failure.message with | some message => Json.str message | none => Json.null)])

def observationJson (program : Program) (definition : Population.DeploymentRef) (state : State) : Json :=
  let o := Publish.observe program state
  let array {α : Type} (items : List α) (encode : α → Json) : Json := Json.arr (items.map encode).toArray
  let fields : List (String × Json) := [
    ("kind", "state"), ("instanceId", Json.str o.instanceId), ("status", Json.str o.status),
    ("activeWaits", array o.activeWaits fun wait => Json.mkObj [("elementId", Json.str wait.elementId),
      ("kind", Json.str wait.kind), ("multiplicity", toJson wait.multiplicity)]),
    ("openUserTasks", array o.openUserTasks openUserTaskJson),
    ("openMessageSubscriptions", array o.openMessageSubscriptions fun subscription =>
      Json.mkObj [("id", occurrenceJson subscription.id), ("channel", Codec.channelToJson subscription.channel)]),
    ("openTimers", array o.openTimers fun timer =>
      Json.mkObj [("id", occurrenceJson timer.id), ("deadlineMs", toJson timer.deadlineMs)]),
    ("openEffects", array o.openEffects openEffectJson),
    ("openIncidents", array o.openIncidents fun incident => Json.mkObj [("kind", "effectExecutionFailed"),
      ("id", incidentIdJson incident.effect.id incident.generation), ("effect", openEffectJson incident.effect)]),
    ("variables", Codec.bindingsToJson o.variables),
    ("enabledInteractions",
      array o.enabledInteractions (interactionJson o.instanceId definition program.identity.processId)),
    ("logicalTimeMs", toJson o.logicalTimeMs)]
  Json.mkObj (fields ++ multiInstancesJson program state ++ (o.failure.map failureJson).toList)

def commandJson (commandId outcome : String) : Json :=
  Json.mkObj [("kind", "command"), ("commandId", Json.str commandId), ("outcome", Json.str outcome)]

def snapshot (program : Program) (definition : Population.DeploymentRef) (state : Option State) : List Json :=
  match state with
  | some state => [observationJson program definition state]
  | none => []

/-- The trace after deployment and the scenario outcome. -/
def execute (program : Program) (definition : Population.DeploymentRef) :
    Option State → List (String × Option Input) → List Json × String
  | _, [] => ([], "committed")
  | state, (commandId, input) :: rest =>
    let result : Outcome :=
      match input with
      | some input => Step.step Registry.hooks program state input
      | none => .error (.unsupported "stimulus") -- dynamic-only: a stimulus kind the scenario states
    match result with
    | .ok next =>
      let (trace, outcome) := execute program definition (some next) rest
      (commandJson commandId "committed" :: snapshot program definition (some next) ++ trace, outcome)
    | .error failure =>
      let name := Codec.failureName failure
      let observed := commandJson commandId name :: snapshot program definition state
      match failure, rest with
      | .rejected _, _ :: _ =>
        let (trace, outcome) := execute program definition state rest
        (observed ++ trace, outcome)
      | _, _ => (observed, name)

/-- `code` appears only on a refused deployment. -/
def deploymentJson (outcome : String) (code : Option String) : Json :=
  let fields : List (String × Json) := [("kind", "deployment"), ("outcome", Json.str outcome)]
  Json.mkObj (fields ++ code.toList.map fun code => ("code", Json.str code))

def result (program : Program) (definition : Population.DeploymentRef) (stimuli : List (String × Option Input)) :
    Json :=
  let semantic (outcome : String) := Json.mkObj [("kind", "semantic"), ("outcome", Json.str outcome)]
  match AdmissionRegistry.admit program with
  | some code =>
    Json.mkObj [("outcome", semantic "unsupported"), ("trace", Json.arr #[deploymentJson "unsupported" (some code)])]
  | none =>
    let (trace, outcome) := execute program definition none stimuli
    Json.mkObj [("outcome", semantic outcome), ("trace", Json.arr (deploymentJson "committed" none :: trace).toArray)]

def readJson (path : String) : IO Json := do
  match Json.parse (← IO.FS.readFile path) with
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

def stimuliFromJson (json : Json) : Except String (List (String × Option Input)) := do
  (← json.getObjValAs? (Array Json) "stimuli").toList.mapM Codec.stimulusFromJson

def run (programPath scenarioPath : String) : IO Json := do
  let program ← orFail programPath (Lean.fromJson? (α := Program) (← readJson programPath))
  if let some code := AdmissionRegistry.admit program then IO.eprintln s!"admission refused: {code}"
  let scenario ← readJson scenarioPath
  let (definition, stimuli) ← orFail scenarioPath do
    pure (← definitionRefFromJson (← scenario.getObjVal? "bpmn") (← scenario.getObjValAs? String "profile"),
      ← stimuliFromJson scenario)
  pure (result program definition stimuli)

/-! ## Host-view mode -/

/-- An already public reference (`Host.publicRef`, `Population.occurrence`). -/
def referenceJson (ref : OccurrenceRef) : Json :=
  occurrenceJson { processInstanceId := ref.processInstanceId, elementId := ref.element.value, activation := ref.activation }

def roleName : ActivationRole → String
  | .element => "element"
  | .multiInstanceBody => "multiInstanceBody"

def keyJson (key : OccurrenceKey) : Json :=
  Json.mkObj [("processInstanceId", Json.str key.processInstanceId), ("elementId", Json.str key.element.value),
    ("activation", toJson key.activation), ("role", Json.str (roleName key.role))]

def inputTagName : InputTag → String
  | .start => "start"
  | .command => "command"
  | .deliver => "deliver"
  | .timerFire => "timerFire"
  | .effectResult => "effectResult"

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
def hostViews (program : Program) : Option State → List (String × Option Input) → List Host.View
  | _, [] => []
  | state, (_, input) :: rest =>
    match input with
    | none => []
    | some input =>
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
  let program ← orFail programPath (Lean.fromJson? (α := Program) (← readJson programPath))
  let scenario ← readJson scenarioPath
  let (definition, stimuli) ← orFail scenarioPath do
    pure (← definitionRefFromJson (← scenario.getObjVal? "bpmn") (← scenario.getObjValAs? String "profile"),
      ← stimuliFromJson scenario)
  let views := if (AdmissionRegistry.admit program).isSome then [] else hostViews program none stimuli
  pure (Json.mkObj [("result", result program definition stimuli),
    ("hostRequirements", requirementsJson (Host.hostRequirements program)),
    ("definitionCapabilities", capabilitiesJson (Host.definitionCapabilities program)),
    ("hostViews", Json.arr (views.map hostViewJson).toArray)])

/-! ## Population mode -/

def addressFromJson (json : Json) : Except String Population.Address := do
  let definition ← json.getObjVal? "definition"
  let named ← definition.getObjValAs? String "compiler"
  unless named == compiler do throw s!"unknown compiler {named}"
  let resource := Json.mkObj [("id", ← definition.getObjVal? "sourceId"),
    ("sha256", ← definition.getObjVal? "sourceSha256"), ("sourceOverlay", ← definition.getObjVal? "sourceOverlay")]
  pure { definition := ← definitionRefFromJson resource (← definition.getObjValAs? String "semanticProfile")
         processId := ← json.getObjValAs? String "processId"
         channel := ← Codec.channelFromJson (← json.getObjVal? "channel")
         correlationKey := ← json.getObjValAs? String "correlationKeyId" }

def publicationFromJson (json : Json) : Except String Population.Publication := do
  let kind ← json.getObjValAs? String "kind"
  unless kind == "publishCorrelatedPayloadMessage" do throw s!"unknown publication kind {kind}"
  let payload ← json.getObjVal? "payload"
  let payloadKind ← payload.getObjValAs? String "kind"
  unless payloadKind == "string" do throw s!"unknown publication payload kind {payloadKind}"
  pure { commandId := ← json.getObjValAs? String "commandId"
         address := ← addressFromJson (← json.getObjVal? "address")
         payload := ← payload.getObjValAs? String "value" }

/-- An instance's definition and its inputs; a stimulus the kernel does not accept refuses the scenario, and so does
an instance without inputs. -/
def scriptFromJson (definitions : List (String × Population.Definition)) (json : Json) :
    Except String (Population.Definition × List (String × Input)) := do
  let id ← json.getObjValAs? String "definitionId"
  let some (_, definition) := definitions.find? (·.1 == id) | throw s!"unknown definition {id}"
  let inputs ← (← stimuliFromJson json).mapM fun (commandId, input) =>
    match input with
    | some input => pure (commandId, input)
    | none => throw s!"unsupported stimulus {commandId}"
  if inputs.isEmpty then throw s!"instance without inputs for definition {id}"
  pure (definition, inputs)

/-- The current population form lists every instance's inputs, then the publications: one ordered list. -/
def populationStimuli (scripts : List (Population.Definition × List (String × Input)))
    (publications : List Population.Publication) : List Population.Stimulus :=
  (scripts.zipIdx.flatMap fun ((definition, inputs), script) =>
    inputs.map fun (commandId, input) => .input script definition commandId input) ++ publications.map .publish

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
      observationJson member.definition.program member.definition.ref member.state).toArray),
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
    let program ← orFail programPath (Lean.fromJson? (α := Program) (← readJson programPath))
    if let some code := AdmissionRegistry.admit program then
      throw (IO.userError s!"{programPath}: admission refused: {code}")
    let (id, ref) ← orFail scenarioPath do
      pure (← resource.getObjValAs? String "id", ← definitionRefFromJson resource profile)
    unless program.identity.sourceSha256 == ref.sourceSha256 && program.identity.profile == profile do
      throw (IO.userError s!"{programPath}: program identity differs from definition {id}")
    pure (id, ({ ref, program } : Population.Definition))
  let (scripts, publications) ← orFail scenarioPath do
    pure (← (← scenario.getObjValAs? (Array Json) "instances").toList.mapM (scriptFromJson definitions),
      ← (← scenario.getObjValAs? (Array Json) "publications").toList.mapM publicationFromJson)
  let result ← orFail scenarioPath
    (Population.run Registry.hooks (definitions.map (·.2)) (populationStimuli scripts publications))
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
