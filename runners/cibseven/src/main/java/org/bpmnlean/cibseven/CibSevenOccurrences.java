package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
 * ([State](../../../../../../../../Kernel/State.lean) `Occurrence`). CIB has no activation numbers, so an activity
 * instance's activation is its position among the element's historic activity instances in that process instance,
 * in occurrence order. A subscription without an activity instance of its own (a boundary Event, an Event
 * Sub-Process start, an arm of an Event-Based Gateway) takes the activation of the activity instance it hangs on:
 * one arming per host activation, which a repeatedly firing non-interrupting subscription would break.
 */
final class CibSevenOccurrences {

  private static final String LOOP_COUNTER = "loopCounter";

  private final ProcessEngine engine;
  private final Map<String, List<String>> ordinals = new HashMap<>();

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
    return new Instance(
        engineId,
        stableId,
        definition,
        engine.getRepositoryService().getBpmnModelInstance(process.getProcessDefinitionId()),
        runtime.getActivityInstance(engineId));
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
    var ids =
        ordinals.computeIfAbsent(
            engineId + "\u0000" + activityId,
            ignored ->
                engine.getHistoryService().createHistoricActivityInstanceQuery()
                    .processInstanceId(engineId).activityId(activityId)
                    .orderPartiallyByOccurrence().asc().list().stream()
                    .map(instance -> instance.getId())
                    .toList());
    var index = ids.indexOf(activityInstanceId);
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
