package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.cibseven.bpm.engine.ActivityTypes;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.history.HistoricActivityInstance;
import org.cibseven.bpm.engine.history.HistoricProcessInstance;
import org.cibseven.bpm.model.bpmn.instance.SignalEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.StartEvent;
import org.cibseven.bpm.model.bpmn.instance.ThrowEvent;

/**
 * Names the root instances a thrown Signal started inside a step: a cascaded intent, whose identity is the command's
 * start identity extended by its emitter's key (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#signal-broadcasts:
 * `start:<len>:<commandId>:<len>:<deploymentId>:<len>:<startEventId>:<len>:<emitterKey>`, the emitter key
 * `<len>:<processInstanceId>:<len>:<publicElementId>:<activation>` of the throw occurrence).
 *
 * <p>CIB records no link from a started instance to the throw that started it, so the emitter is the one Signal throw
 * of the started start's Signal that began during the step, from CIB's activity history: a throw Event or End Event
 * whose Signal name is that name, or an expression CIB resolved only at the throw. A step with no such throw, or with
 * several, leaves the instance without a derivable identity, a harness failure and a limitation of this runner.
 */
final class CibSevenCascades {

  private final ProcessEngine engine;
  private final CibSevenPopulationRegistry registry;
  private final CibSevenStateProjector projector;
  /** The population's root instances, engine identifier to public identifier, which the population runner keeps. */
  private final Map<String, String> roots;

  CibSevenCascades(
      ProcessEngine engine,
      CibSevenPopulationRegistry registry,
      CibSevenStateProjector projector,
      Map<String, String> roots) {
    this.engine = engine;
    this.registry = registry;
    this.projector = projector;
    this.roots = roots;
  }

  /** The identifiers of every activity instance so far, so a step's own throws are the ones it adds. */
  Set<String> activities() {
    var ids = new HashSet<String>();
    for (var activity : engine.getHistoryService().createHistoricActivityInstanceQuery().list()) {
      ids.add(activity.getId());
    }
    return ids;
  }

  /** The Signal throws that began since `before` whose Signal may be named `name`. */
  List<HistoricActivityInstance> throwsOf(String name, Set<String> before) {
    return engine.getHistoryService().createHistoricActivityInstanceQuery().list().stream()
        .filter(activity -> !before.contains(activity.getId()))
        .filter(activity -> ActivityTypes.INTERMEDIATE_EVENT_SIGNAL_THROW.equals(activity.getActivityType())
            || ActivityTypes.END_EVENT_SIGNAL.equals(activity.getActivityType()))
        .filter(activity -> mayName(thrownSignal(activity), name))
        .toList();
  }

  /**
   * The cascade identity of `instance`, a root `commandId`'s step started at a Signal start without starting it
   * itself; a harness failure when the step began no throw of that Signal, or several.
   */
  String identify(HistoricProcessInstance instance, String commandId, Set<String> before) {
    var repository = engine.getRepositoryService();
    var definition = repository.getProcessDefinition(instance.getProcessDefinitionId());
    var startEvent = instance.getStartActivityId();
    var name = repository.getBpmnModelInstance(definition.getId()).getModelElementById(startEvent)
            instanceof StartEvent start
        ? signalOf(start.getEventDefinitions().stream()
            .filter(SignalEventDefinition.class::isInstance).map(SignalEventDefinition.class::cast).toList())
        : null;
    if (name == null || commandId == null) {
      throw new IllegalStateException("Root instance " + instance.getId() + " began at " + startEvent
          + ", which no Signal throw of its step started; this runner derives no identity for it");
    }
    var emitters = throwsOf(name, before);
    if (emitters.size() != 1) {
      throw new IllegalStateException("Root instance " + instance.getId() + " began at Signal start " + startEvent
          + " after " + emitters.size() + " throws of " + name + " in one step; its emitter cannot be told");
    }
    var emitter = emitters.getFirst();
    var key = emitterKey(publicInstanceOf(emitter.getProcessInstanceId()), emitter.getActivityId(), activation(emitter));
    return cascadeInstanceId(commandId, registry.ordinalOf(definition.getDeploymentId()), startEvent, key);
  }

  /**
   * The public identifier of the emitter's instance: a root's, or a running called instance's. A called instance that
   * ended inside the step has no projection left to name it.
   */
  private String publicInstanceOf(String engineInstance) {
    var root = roots.get(engineInstance);
    if (root != null) {
      return root;
    }
    for (var entry : roots.entrySet()) {
      for (var called : projector.occurrences().running(entry.getKey(), entry.getValue())) {
        if (called.engineId().equals(engineInstance)) {
          return called.stableId();
        }
      }
    }
    throw new IllegalStateException("The Signal throw's instance " + engineInstance + " has no public identifier");
  }

  /**
   * The throw's activation: its position among its element's activity instances in its process instance, in CIB's
   * occurrence order, the order {@link CibSevenOccurrences} numbers an element that is no subscription. A throw inside
   * concurrent Multi-Instance instances, which that class orders by `loopCounter`, is not covered.
   */
  private long activation(HistoricActivityInstance emitter) {
    var ordered = engine.getHistoryService().createHistoricActivityInstanceQuery()
        .processInstanceId(emitter.getProcessInstanceId()).activityId(emitter.getActivityId())
        .orderPartiallyByOccurrence().asc().list();
    for (var index = 0; index < ordered.size(); index++) {
      if (ordered.get(index).getId().equals(emitter.getId())) {
        return index + 1L;
      }
    }
    throw new IllegalStateException("Signal throw " + emitter.getId() + " has no history");
  }

  private String thrownSignal(HistoricActivityInstance activity) {
    var model = engine.getRepositoryService().getBpmnModelInstance(activity.getProcessDefinitionId());
    return model.getModelElementById(activity.getActivityId()) instanceof ThrowEvent event
        ? signalOf(event.getEventDefinitions().stream()
            .filter(SignalEventDefinition.class::isInstance).map(SignalEventDefinition.class::cast).toList())
        : null;
  }

  private static String signalOf(List<SignalEventDefinition> definitions) {
    return definitions.size() == 1 && definitions.getFirst().getSignal() != null
        ? definitions.getFirst().getSignal().getName()
        : null;
  }

  /** Whether a throw's Signal name may be `name`: equal, or an expression CIB resolves only at the throw. */
  private static boolean mayName(String thrown, String name) {
    return thrown != null && (thrown.equals(name) || thrown.contains("${") || thrown.contains("#{"));
  }

  /** The emitter key of a throw occurrence: its instance and public element identifier, each length-prefixed. */
  static String emitterKey(String processInstanceId, String elementId, long activation) {
    return length(processInstanceId) + ":" + processInstanceId + ":" + length(elementId) + ":" + elementId + ":"
        + activation;
  }

  /** The identity of an instance a cascaded intent started: the command's start identity, then the emitter key. */
  static String cascadeInstanceId(String commandId, long deploymentId, String startEvent, String emitterKey) {
    return CibSevenPopulationCommands.startedInstanceId(commandId, deploymentId, startEvent) + ":"
        + length(emitterKey) + ":" + emitterKey;
  }

  private static int length(String part) {
    return part.getBytes(UTF_8).length;
  }
}
