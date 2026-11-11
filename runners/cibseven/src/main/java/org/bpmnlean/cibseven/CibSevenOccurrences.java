package org.bpmnlean.cibseven;

import static java.nio.charset.StandardCharsets.UTF_8;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import org.bpmnlean.cibseven.ScenarioProtocol.DefinitionRef;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.cibseven.bpm.engine.repository.ProcessDefinition;
import org.cibseven.bpm.engine.runtime.ActivityInstance;
import org.cibseven.bpm.engine.runtime.TransitionInstance;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.Activity;
import org.cibseven.bpm.model.bpmn.instance.BoundaryEvent;
import org.cibseven.bpm.model.bpmn.instance.CatchEvent;
import org.cibseven.bpm.model.bpmn.instance.ConditionalEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.EventBasedGateway;
import org.cibseven.bpm.model.bpmn.instance.FlowNode;
import org.cibseven.bpm.model.bpmn.instance.IntermediateCatchEvent;
import org.cibseven.bpm.model.bpmn.instance.MessageEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.MultiInstanceLoopCharacteristics;
import org.cibseven.bpm.model.bpmn.instance.SequenceFlow;
import org.cibseven.bpm.model.bpmn.instance.SignalEventDefinition;
import org.cibseven.bpm.model.bpmn.instance.StartEvent;
import org.cibseven.bpm.model.bpmn.instance.SubProcess;
import org.cibseven.bpm.model.bpmn.instance.TimerEventDefinition;

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
 * first: the instances' generation order (BPMN 2.0.2 Table 10.30), in which the kernel begins them.
 *
 * <p>A subscription without an activity instance of its own (a Timer, Message, Signal or Conditional boundary Event,
 * Event Sub-Process start, or arm of an Event-Based Gateway) is numbered by counting the kernel's reservations of its
 * element (CIB-OP-0018): each activation of its host reserves one, observed or not; a cycle successor
 * reserves one when the runner fires its predecessor; a firing whose subscription stays open (a repeating Message)
 * begins a fresh one; a firing that closes its subscription begins that subscription's own. A begin the runner did not
 * drive (a Conditional or Signal firing) takes a fresh activation when its element does not interrupt, otherwise the
 * oldest live reservation of its element.
 */
final class CibSevenOccurrences {

  private static final String LOOP_COUNTER = "loopCounter";
  private static final String SEPARATOR = "\u0000";

  private final ProcessEngine engine;
  private final Function<ProcessDefinition, DefinitionRef> calledDefinition;
  private final Map<String, List<String>> ordinals = new HashMap<>();
  private final Set<String> numbered = new HashSet<>();
  private final Map<String, BpmnModelInstance> models = new HashMap<>();
  /** Per instance and subscription element, the next activation the kernel reserves. */
  private final Map<String, Long> nextReservation = new HashMap<>();
  /** Per instance, host activity instance (the process instance for root starts) and element, its reservation. */
  private final Map<String, Long> hostReservations = new HashMap<>();
  /** Per instance and CIB subscription (Timer job or event subscription), its activation. */
  private final Map<String, Long> subscriptions = new HashMap<>();
  /** Per instance and CIB subscription, how many earlier firings its cycle chain has had. */
  private final Map<String, Long> chainFirings = new HashMap<>();
  /** Per instance and element, the activations of reservations not yet begun, oldest first. */
  private final Map<String, LinkedHashSet<Long>> live = new HashMap<>();
  /** Per instance and element, the activations the runner's firings begin, in firing order. */
  private final Map<String, ArrayDeque<Long>> pendingBegins = new HashMap<>();
  /** The activation each begun activity instance of a subscription element took. */
  private final Map<String, Long> begun = new HashMap<>();

  /** `calledDefinition` names the definition a called instance runs, as its open waits publish it. */
  CibSevenOccurrences(ProcessEngine engine, Function<ProcessDefinition, DefinitionRef> calledDefinition) {
    this.engine = engine;
    this.calledDefinition = calledDefinition;
  }

  /**
   * A single-instance scenario's called definition: its key alone, as the kernel names a callee its one document
   * carries unstamped.
   */
  static DefinitionRef keyOnly(ProcessDefinition definition) {
    return new DefinitionRef(definition.getKey(), null, null, null, null, null);
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
      var called =
          instance(
              child.getId(),
              stableId,
              calledDefinition.apply(
                  engine.getRepositoryService().getProcessDefinition(child.getProcessDefinitionId())));
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
    if (models.putIfAbsent(engineId, found.model()) == null) {
      // The process instance is the host of its root Event Sub-Process starts, armed when it starts.
      for (var element : hosted(found.model(), null)) {
        hostReservations.put(key(engineId, engineId, element), reserve(engineId, element));
      }
    }
    number(found);
    return found;
  }

  /** Appends the activity instances begun since the last observation of `instance` to their elements' activations. */
  private void number(Instance instance) {
    var unnumbered =
        engine.getHistoryService().createHistoricActivityInstanceQuery()
            .processInstanceId(instance.engineId()).orderPartiallyByOccurrence().asc().list().stream()
            .filter(historic -> !numbered.contains(historic.getId()))
            .toList();
    var byElement = new LinkedHashMap<String, List<String>>();
    for (var historic : unnumbered) {
      byElement.computeIfAbsent(historic.getActivityId(), ignored -> new ArrayList<>()).add(historic.getId());
    }
    var counters = loopCounters(instance.tree());
    var ordered = new LinkedHashMap<String, List<String>>();
    byElement.forEach((element, ids) -> ordered.put(element, generationOrder(ids, counters)));
    // A boundary that fires at its host's entry can sort before its host, yet the host arms it first (CIB-OP-0018): the
    // subscription keeps the host's reservation and the firing begins after it, so every new host reserves first.
    ordered.forEach((element, ids) -> {
      for (var id : ids) {
        for (var hosted : hosted(instance.model(), element)) {
          hostReservations.put(key(instance.engineId(), id, hosted), reserve(instance.engineId(), hosted));
        }
      }
    });
    ordered.forEach((element, ids) -> {
      if (subscriptionElement(instance.model(), element)) {
        for (var id : ids) {
          begun.put(id, beginActivation(instance, element));
        }
      } else {
        ordinals.computeIfAbsent(instance.engineId() + "\u0000" + element, ignored -> new ArrayList<>()).addAll(ids);
      }
      numbered.addAll(ids);
    });
  }

  private static String key(String... parts) {
    return String.join(SEPARATOR, parts);
  }

  private long reserve(String engineId, String element) {
    var activation = nextReservation.merge(key(engineId, element), 1L, Long::sum);
    live.computeIfAbsent(key(engineId, element), ignored -> new LinkedHashSet<>()).add(activation);
    return activation;
  }

  /** The activation a begun activity instance of a subscription element takes (class comment). */
  private long beginActivation(Instance instance, String element) {
    var pending = pendingBegins.get(key(instance.engineId(), element));
    if (pending != null && !pending.isEmpty()) {
      return pending.poll();
    }
    var reservations = live.get(key(instance.engineId(), element));
    if (interrupting(instance.model(), element) && reservations != null && !reservations.isEmpty()) {
      var oldest = reservations.iterator().next();
      reservations.remove(oldest);
      return oldest;
    }
    var fresh = reserve(instance.engineId(), element);
    live.get(key(instance.engineId(), element)).remove(fresh);
    return fresh;
  }

  /**
   * The runner fired the Timer job `jobId` of `element`; `successors` are the jobs of `element` CIB created by that
   * firing. A successor reserves the next activation, and the fired job's own begins.
   */
  void timerFired(String engineId, String element, String jobId, List<String> successors) {
    var model = models.get(engineId);
    if (model == null || !subscriptionElement(model, element)) {
      return;
    }
    var fired = subscriptions.get(key(engineId, jobId));
    if (fired == null) {
      throw new IllegalStateException("Timer job " + jobId + " fired before it was numbered");
    }
    for (var successor : successors) {
      subscriptions.put(key(engineId, successor), reserve(engineId, element));
      chainFirings.put(key(engineId, successor), chainFirings.getOrDefault(key(engineId, jobId), 0L) + 1);
    }
    begin(engineId, element, fired);
  }

  /**
   * The runner delivered to the event subscription `subscriptionId` of `element`: one that stays open begins a fresh
   * activation, one that closes begins its own.
   */
  void delivered(String engineId, String element, String subscriptionId, boolean stillOpen) {
    var model = models.get(engineId);
    if (model == null || !subscriptionElement(model, element)) {
      return;
    }
    var fired = subscriptions.get(key(engineId, subscriptionId));
    if (fired == null) {
      throw new IllegalStateException("Event subscription " + subscriptionId + " fired before it was numbered");
    }
    if (stillOpen) {
      var fresh = reserve(engineId, element);
      live.get(key(engineId, element)).remove(fresh);
      pendingBegins.computeIfAbsent(key(engineId, element), ignored -> new ArrayDeque<>()).add(fresh);
    } else {
      begin(engineId, element, fired);
    }
  }

  private void begin(String engineId, String element, long activation) {
    var reservations = live.get(key(engineId, element));
    if (reservations != null) {
      reservations.remove(activation);
    }
    pendingBegins.computeIfAbsent(key(engineId, element), ignored -> new ArrayDeque<>()).add(activation);
  }

  /** How many earlier firings the cycle chain of the Timer job `jobId` has had (`recurrence.remaining`). */
  long chainFirings(String engineId, String jobId) {
    return chainFirings.getOrDefault(key(engineId, jobId), 0L);
  }

  /**
   * The activation of a subscription without an activity instance of its own: the one it already has, else the
   * reservation its host's activation made.
   */
  long subscriptionActivation(Instance instance, String activityId, String executionId, String subscriptionId) {
    var own = activityInstance(instance.tree(), activityId, executionId);
    if (own != null || !subscriptionElement(instance.model(), activityId)) {
      return activation(instance, activityId, executionId);
    }
    var known = subscriptions.get(key(instance.engineId(), subscriptionId));
    if (known != null) {
      return known;
    }
    var host = hostInstance(instance, activityId, executionId);
    var reserved = hostReservations.remove(key(instance.engineId(), host, activityId));
    if (reserved == null) {
      throw new IllegalStateException("Subscription " + activityId + " has no reservation on its host " + host);
    }
    subscriptions.put(key(instance.engineId(), subscriptionId), reserved);
    return reserved;
  }

  /** The activity instance a subscription hangs on, or the process instance for a root Event Sub-Process start. */
  private String hostInstance(Instance instance, String activityId, String executionId) {
    var host = hostOf(instance.model(), activityId);
    if (host == null) {
      return instance.engineId();
    }
    var hosts = new ArrayList<ActivityInstance>();
    if (instance.model().getModelElementById(host) instanceof Activity activity
        && activity.getLoopCharacteristics() instanceof MultiInstanceLoopCharacteristics
        && instance.model().getModelElementById(activityId) instanceof BoundaryEvent) {
      hosts.addAll(activityInstances(instance.tree(), host + BpmnParse.MULTI_INSTANCE_BODY_ID_SUFFIX));
    } else {
      hosts.addAll(activityInstances(instance.tree(), host));
    }
    var matching = hosts.stream().filter(candidate -> contains(candidate, executionId)).toList();
    var selected = hosts.size() == 1 ? hosts : matching;
    if (selected.size() != 1) {
      throw new IllegalStateException("Subscription " + activityId + " has no unique host instance");
    }
    return selected.getFirst().getId();
  }

  /** Whether `element` waits as a subscription without an activity instance of its own (class comment). */
  private static boolean subscriptionElement(BpmnModelInstance model, String element) {
    var node = model.getModelElementById(element);
    var attached =
        node instanceof BoundaryEvent
            || (node instanceof StartEvent start
                && start.getParentElement() instanceof SubProcess scope
                && scope.triggeredByEvent())
            || (node instanceof IntermediateCatchEvent && hostOf(model, element) != null);
    return attached
        && node instanceof CatchEvent catchEvent
        && catchEvent.getEventDefinitions().stream()
            .anyMatch(
                definition ->
                    definition instanceof TimerEventDefinition
                        || definition instanceof MessageEventDefinition
                        || definition instanceof SignalEventDefinition
                        || definition instanceof ConditionalEventDefinition);
  }

  private static boolean interrupting(BpmnModelInstance model, String element) {
    return switch (model.getModelElementById(element)) {
      case BoundaryEvent boundary -> boundary.cancelActivity();
      case StartEvent start -> start.isInterrupting();
      default -> true;
    };
  }

  /**
   * The subscription elements an activity instance of `historicActivityId` arms, in document order: a Multi-Instance
   * body's or a plain Activity's boundaries, a Sub-Process's own Event Sub-Process starts, an Event-Based Gateway's
   * arms; `null` names the process, which arms its root Event Sub-Process starts.
   */
  private static List<String> hosted(BpmnModelInstance model, String historicActivityId) {
    var body = historicActivityId != null && historicActivityId.endsWith(BpmnParse.MULTI_INSTANCE_BODY_ID_SUFFIX);
    var elementId =
        body
            ? historicActivityId.substring(
                0, historicActivityId.length() - BpmnParse.MULTI_INSTANCE_BODY_ID_SUFFIX.length())
            : historicActivityId;
    var element = elementId == null ? null : model.getModelElementById(elementId);
    var found = new ArrayList<String>();
    var multiInstance =
        element instanceof Activity activity
            && activity.getLoopCharacteristics() instanceof MultiInstanceLoopCharacteristics;
    if (element instanceof Activity && (body || !multiInstance)) {
      for (var boundary : model.getModelElementsByType(BoundaryEvent.class)) {
        if (boundary.getAttachedTo() == element) {
          found.add(boundary.getId());
        }
      }
    }
    if (!body) {
      for (var start : model.getModelElementsByType(StartEvent.class)) {
        if (start.getParentElement() instanceof SubProcess scope
            && scope.triggeredByEvent()
            && (elementId == null
                ? !(scope.getParentElement() instanceof SubProcess)
                : scope.getParentElement() == element)) {
          found.add(start.getId());
        }
      }
    }
    if (element instanceof EventBasedGateway) {
      for (var flow : model.getModelElementsByType(SequenceFlow.class)) {
        if (flow.getSource() == element) {
          found.add(flow.getTarget().getId());
        }
      }
    }
    return found.stream().filter(id -> subscriptionElement(model, id)).toList();
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
    var subscriptionBegin = begun.get(activityInstanceId);
    if (subscriptionBegin != null) {
      return subscriptionBegin;
    }
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
