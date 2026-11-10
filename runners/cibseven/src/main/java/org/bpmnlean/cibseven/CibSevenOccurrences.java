package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.bpmnlean.cibseven.ScenarioProtocol.DefinitionRef;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.cibseven.bpm.engine.runtime.ActivityInstance;
import org.cibseven.bpm.engine.runtime.TransitionInstance;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.Activity;
import org.cibseven.bpm.model.bpmn.instance.BoundaryEvent;
import org.cibseven.bpm.model.bpmn.instance.EventBasedGateway;
import org.cibseven.bpm.model.bpmn.instance.FlowNode;
import org.cibseven.bpm.model.bpmn.instance.MultiInstanceLoopCharacteristics;
import org.cibseven.bpm.model.bpmn.instance.SequenceFlow;
import org.cibseven.bpm.model.bpmn.instance.StartEvent;
import org.cibseven.bpm.model.bpmn.instance.SubProcess;

/**
 * Derives the public occurrence identity of engine state: the stable process-instance identifier and the activation
 * number of an element, both from public runtime and history services.
 *
 * <p>The kernel numbers the activations of an element per process instance from 1, a subscription when it is armed
 * ([State](../../../../../../../../Kernel/State.lean) `Occurrence`), in begin order. CIB has no activation numbers,
 * so an activity instance's activation is its position among the element's activity instances in that process
 * instance, appended as each observation first sees them and never renumbered. CIB's occurrence order
 * (`orderPartiallyByOccurrence`) compares sequence counters, which concurrent executions do not share: read afresh, it
 * can place a later activation before an earlier one, and it cannot order the activations one step begins in
 * concurrent instances. Those are ordered by the `loopCounter`s of their enclosing Multi-Instance instances, outermost
 * first: the instances' generation order (BPMN 2.0.2 Table 10.30), in which the kernel begins them. A subscription without an activity instance of its own (a boundary Event, an Event
 * Sub-Process start, an arm of an Event-Based Gateway) takes the activation of the activity instance it hangs on:
 * one arming per host activation, which a repeatedly firing non-interrupting subscription would break.
 */
final class CibSevenOccurrences {

  private static final String LOOP_COUNTER = "loopCounter";

  private final ProcessEngine engine;
  private final Map<String, List<String>> ordinals = new HashMap<>();
  private final Set<String> numbered = new HashSet<>();

  CibSevenOccurrences(ProcessEngine engine) {
    this.engine = engine;
  }

  /** One running process instance: its engine and stable identifiers and the called definition it runs. */
  record Instance(
      String engineId,
      String stableId,
      DefinitionRef definition,
      BpmnModelInstance model,
      ActivityInstance tree) {}

  /** The running root and every running called instance below it, the caller first. */
  List<Instance> running(String engineRootId, String stableRootId) {
    var instances = new ArrayList<Instance>();
    var root = instance(engineRootId, stableRootId, null);
    if (root != null) {
      collect(root, instances);
    }
    return instances;
  }

  private void collect(Instance caller, List<Instance> instances) {
    instances.add(caller);
    var history = engine.getHistoryService();
    for (var child :
        engine.getRuntimeService().createProcessInstanceQuery()
            .superProcessInstanceId(caller.engineId()).list()) {
      var calls =
          history.createHistoricActivityInstanceQuery().processInstanceId(caller.engineId()).list().stream()
              .filter(call -> child.getId().equals(call.getCalledProcessInstanceId()))
              .toList();
      if (calls.size() != 1) {
        throw new IllegalStateException("Called instance " + child.getId() + " has no unique Call Activity");
      }
      var call = calls.getFirst();
      var activation = ordinal(caller.engineId(), call.getActivityId(), call.getId());
      var stableId = calledInstanceId(caller.stableId(), call.getActivityId(), activation);
      var key =
          engine.getRepositoryService().getProcessDefinition(child.getProcessDefinitionId()).getKey();
      var called =
          instance(child.getId(), stableId, new DefinitionRef(key, null, null, null, null, null));
      if (called != null) {
        collect(called, instances);
      }
    }
  }

  private Instance instance(String engineId, String stableId, DefinitionRef definition) {
    var runtime = engine.getRuntimeService();
    var process = runtime.createProcessInstanceQuery().processInstanceId(engineId).singleResult();
    if (process == null) {
      return null;
    }
    var found =
        new Instance(
            engineId,
            stableId,
            definition,
            engine.getRepositoryService().getBpmnModelInstance(process.getProcessDefinitionId()),
            runtime.getActivityInstance(engineId));
    number(found);
    return found;
  }

  /** Appends the activity instances begun since the last observation of `instance` to their elements' activations. */
  private void number(Instance instance) {
    var begun =
        engine.getHistoryService().createHistoricActivityInstanceQuery()
            .processInstanceId(instance.engineId()).orderPartiallyByOccurrence().asc().list().stream()
            .filter(historic -> !numbered.contains(historic.getId()))
            .toList();
    var byElement = new LinkedHashMap<String, List<String>>();
    for (var historic : begun) {
      byElement.computeIfAbsent(historic.getActivityId(), ignored -> new ArrayList<>()).add(historic.getId());
    }
    var counters = loopCounters(instance.tree());
    for (var element : byElement.entrySet()) {
      var ids = generationOrder(element.getValue(), counters);
      ordinals.computeIfAbsent(instance.engineId() + "\u0000" + element.getKey(), ignored -> new ArrayList<>())
          .addAll(ids);
      numbered.addAll(ids);
    }
  }

  /**
   * One observation's new activations of an element, by their enclosing instances' `loopCounter`s when every one is
   * still running inside the same depth of Multi-Instance instances; otherwise in CIB's occurrence order.
   */
  private static List<String> generationOrder(List<String> ids, Map<String, List<Integer>> counters) {
    var depths = ids.stream().map(id -> counters.getOrDefault(id, List.of()).size()).distinct().toList();
    if (ids.size() < 2 || depths.size() != 1 || depths.getFirst() == 0) {
      return ids;
    }
    var ordered = new ArrayList<>(ids);
    ordered.sort(Comparator.comparing(counters::get, CibSevenOccurrences::compareCounters));
    return ordered;
  }

  private static int compareCounters(List<Integer> left, List<Integer> right) {
    for (var index = 0; index < left.size(); index++) {
      var order = Integer.compare(left.get(index), right.get(index));
      if (order != 0) {
        return order;
      }
    }
    return 0;
  }

  /**
   * The `loopCounter`s of the Multi-Instance instances enclosing each running activity instance, outermost first. An
   * inner instance is a child of its body's activity instance; its execution resolves `loopCounter` to its own.
   */
  private Map<String, List<Integer>> loopCounters(ActivityInstance tree) {
    var counters = new HashMap<String, List<Integer>>();
    enclose(tree, false, List.of(), counters);
    return counters;
  }

  private void enclose(
      ActivityInstance node, boolean inBody, List<Integer> path, Map<String, List<Integer>> counters) {
    var own = path;
    if (inBody && engine.getRuntimeService().getVariable(node.getExecutionIds()[0], LOOP_COUNTER)
        instanceof Integer counter) {
      own = new ArrayList<>(path);
      own.add(counter);
    }
    counters.put(node.getId(), own);
    var body = node.getActivityId() != null && node.getActivityId().endsWith(BpmnParse.MULTI_INSTANCE_BODY_ID_SUFFIX);
    for (var child : node.getChildActivityInstances()) {
      enclose(child, body, own, counters);
    }
  }

  /**
   * The kernel's called-instance identifier ([State](../../../../../../../../Kernel/State.lean) `calledInstanceId`):
   * each part prefixed by its UTF-8 byte length.
   */
  static String calledInstanceId(String caller, String call, long activation) {
    return "call:" + caller.getBytes(UTF_8).length + ":" + caller + ":" + call.getBytes(UTF_8).length + ":" + call
        + ":" + activation;
  }

  /** The activation of the activity instance `activityInstanceId` of `activityId`. */
  long ordinal(String engineId, String activityId, String activityInstanceId) {
    var index = ordinals.getOrDefault(engineId + "\u0000" + activityId, List.of()).indexOf(activityInstanceId);
    if (index < 0) {
      throw new IllegalStateException("Activity instance " + activityInstanceId + " has no history");
    }
    return index + 1L;
  }

  /** The activation of the element an execution waits at: its own activity instance, else the instance it hangs on. */
  long activation(Instance instance, String activityId, String executionId) {
    var own = activityInstance(instance.tree(), activityId, executionId);
    if (own != null) {
      return ordinal(instance.engineId(), activityId, own.getId());
    }
    var host = hostOf(instance.model(), activityId);
    if (host == null) {
      return 1;
    }
    var hosts = activityInstances(instance.tree(), host);
    var matching = hosts.stream().filter(candidate -> contains(candidate, executionId)).toList();
    var selected = hosts.size() == 1 ? hosts : matching;
    if (selected.size() != 1) {
      throw new IllegalStateException("Subscription " + activityId + " has no unique host instance");
    }
    return ordinal(instance.engineId(), host, selected.getFirst().getId());
  }

  /**
   * The activation of an asynchronous continuation that has not begun its activity instance. An inner instance of a
   * Multi-Instance Activity takes its generation order, `loopCounter + 1` (the instance's own sequence number, BPMN
   * 2.0.2 Table 10.30), because CIB begins an asynchronous instance only when the runner releases its job, so a begin
   * order would follow the result schedule. Any other element takes one more than its begun activations, and two such
   * waits of one element cannot be ordered and fail the projection.
   */
  long pendingActivation(Instance instance, String activityId, String executionId) {
    if (instance.model().getModelElementById(activityId) instanceof Activity activity
        && activity.getLoopCharacteristics() instanceof MultiInstanceLoopCharacteristics) {
      return generatedInstanceActivation(instance, activityId, executionId);
    }
    var waiting = transitionInstances(instance.tree(), activityId);
    if (waiting.size() != 1) {
      throw new IllegalStateException(
          "Asynchronous waits of " + activityId + " cannot be numbered: " + waiting.size());
    }
    return engine.getHistoryService().createHistoricActivityInstanceQuery()
            .processInstanceId(instance.engineId()).activityId(activityId).count()
        + 1;
  }

  /**
   * A later entry of the same body would continue the numbering after every instance an earlier entry generated, and
   * CIB keeps no history of a generated instance that never began, so a re-entered body fails the projection
   * (PC-MI-11) rather than guessing its offset.
   */
  private long generatedInstanceActivation(Instance instance, String activityId, String executionId) {
    var entries =
        engine.getHistoryService().createHistoricActivityInstanceQuery()
            .processInstanceId(instance.engineId())
            .activityId(activityId + BpmnParse.MULTI_INSTANCE_BODY_ID_SUFFIX)
            .count();
    if (entries != 1) {
      throw new IllegalStateException(
          "Generated instances of " + activityId + " cannot be numbered across " + entries + " body entries");
    }
    if (!(engine.getRuntimeService().getVariable(executionId, LOOP_COUNTER) instanceof Integer counter)) {
      throw new IllegalStateException("Generated instance of " + activityId + " has no loopCounter");
    }
    return counter + 1L;
  }

  /** The element a subscription without an activity instance hangs on; `null` for the process itself. */
  private static String hostOf(BpmnModelInstance model, String activityId) {
    var element = model.getModelElementById(activityId);
    if (element instanceof BoundaryEvent boundary) {
      return boundary.getAttachedTo().getId();
    }
    if (element instanceof StartEvent start && start.getParentElement() instanceof SubProcess scope) {
      if (scope.triggeredByEvent()) {
        // CIB declares an Event Sub-Process start's subscription on the scope that contains the Event Sub-Process,
        // which has no activity instance of its own until the event arrives (BpmnParse#parseStartEvents).
        return scope.getParentElement() instanceof SubProcess parent ? parent.getId() : null;
      }
      return scope.getId();
    }
    if (element instanceof FlowNode node) {
      // `FlowNode#getPreviousNodes` reads the optional `incoming` references (FlowNodeImpl:136-142), which a model may
      // omit; a Sequence Flow's `sourceRef` and `targetRef` are required.
      var gateways =
          model.getModelElementsByType(SequenceFlow.class).stream()
              .filter(flow -> flow.getTarget() == node)
              .map(SequenceFlow::getSource)
              .filter(EventBasedGateway.class::isInstance)
              .distinct()
              .toList();
      if (gateways.size() == 1) {
        return gateways.getFirst().getId();
      }
    }
    return null;
  }

  static ActivityInstance activityInstance(ActivityInstance tree, String activityId, String executionId) {
    var matches =
        activityInstances(tree, activityId).stream().filter(node -> contains(node, executionId)).toList();
    return matches.size() == 1 ? matches.getFirst() : null;
  }

  static List<ActivityInstance> activityInstances(ActivityInstance tree, String activityId) {
    var found = new ArrayList<ActivityInstance>();
    walk(tree, node -> {
      if (activityId.equals(node.getActivityId())) {
        found.add(node);
      }
    });
    return found;
  }

  static List<TransitionInstance> transitionInstances(ActivityInstance tree, String activityId) {
    var found = new ArrayList<TransitionInstance>();
    walk(tree, node -> {
      for (var transition : node.getChildTransitionInstances()) {
        if (activityId.equals(transition.getActivityId())) {
          found.add(transition);
        }
      }
    });
    return found;
  }

  private static boolean contains(ActivityInstance node, String executionId) {
    for (var id : node.getExecutionIds()) {
      if (id.equals(executionId)) {
        return true;
      }
    }
    return false;
  }

  private static void walk(ActivityInstance node, java.util.function.Consumer<ActivityInstance> visit) {
    visit.accept(node);
    for (var child : node.getChildActivityInstances()) {
      walk(child, visit);
    }
  }
}
