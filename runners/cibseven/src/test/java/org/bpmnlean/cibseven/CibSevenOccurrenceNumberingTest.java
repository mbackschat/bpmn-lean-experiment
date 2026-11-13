package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.engine.runtime.Job;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.ParallelGateway;
import org.junit.Test;

/**
 * The runner numbers an element's activations as the kernel does: in begin order, fixed once an activation is seen.
 * CIB orders historic activity instances only partially (`orderPartiallyByOccurrence` compares sequence counters, which
 * concurrent executions do not share), so a history order read afresh at every state can place a later activation
 * before an earlier one and renumber it, and cannot order the activations one step begins in concurrent instances. An
 * asynchronous wait whose job has not run has no activity instance to order, so it is numbered by the arrival of its job.
 */
public class CibSevenOccurrenceNumberingTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final String PARALLEL_APPLICANTS = "scenarios/open-rows/journey-parallel-applicants/";
  private static final String TWO_ARRIVALS = "Process_TwoArrivals";
  private static final String TASK = "Task";

  /** A wait's `seenStatus` input names the occurrence that reached it; each keeps its first activation. */
  @Test
  public void keepsAnActivationOnceSeenWhileALaterOneBegins() throws Exception {
    var trace = trace("scenarios/open-rows/same-definition-scope-lifetimes/reentry-while-other-live.scenario.json");
    var first = new HashMap<String, Long>();
    var seen = 0;
    for (var observation : trace) {
      for (var wait : waits(observation, "UserTask_Sign")) {
        var activation = wait.get("id").get("activation").asLong();
        var label = input(wait, "seenStatus");
        assertEquals(label, first.computeIfAbsent(label, ignored -> activation), Long.valueOf(activation));
        seen++;
      }
    }
    assertTrue("the witness reaches Sign", seen > 0);
  }

  /** Each inner User Task's `position` input is its instance's `loopCounter`, generated in that order. */
  @Test
  public void numbersTheActivationsOfConcurrentInstancesInGenerationOrder() throws Exception {
    var trace = trace("scenarios/open-rows/multi-instance-sub-process/parallel-sixteen-bodies-natural.scenario.json");
    var state = trace.get(2);
    var inspected = waits(state, "UserTask_Inspect");
    assertEquals(16, inspected.size());
    for (var wait : inspected) {
      assertEquals(
          Long.parseLong(input(wait, "position")) + 1, wait.get("id").get("activation").asLong());
    }
  }

  /** A cycle successor takes a fresh activation, the next the kernel reserves (CIB-OP draft, I6). */
  @Test
  public void numbersACycleSuccessorAsTheElementsNextActivation() throws Exception {
    var seen = 0;
    for (var observation : trace("scenarios/repeatable-event-subscriptions/boundary-timer-repeat.scenario.json")) {
      for (var wait : waits(observation, "Reminder")) {
        assertEquals(wait.get("detail").get("deadlineMs").asLong() / 1000, wait.get("id").get("activation").asLong());
        seen++;
      }
    }
    assertTrue("the witness repeats the Reminder", seen > 1);
  }

  /**
   * A repeating Message firing begins a fresh activation, so the re-entered host's subscription takes the third (I6
   * rule 3); the host rule would give it the second.
   */
  @Test
  public void numbersASubscriptionArmedAfterARepeatingFiringAfterThatFiring() throws Exception {
    var trace =
        trace("scenarios/open-rows/message-boundary-repeated/user-host-reentered-after-delivery.scenario.json");
    var activations = new java.util.TreeSet<Long>();
    for (var observation : trace) {
      for (var wait : waits(observation, "Ping_Loop")) {
        activations.add(wait.get("id").get("activation").asLong());
      }
    }
    assertEquals(java.util.Set.of(1L, 3L), activations);
  }

  /** A finite cycle publishes the firings left including the open one, as the kernel counts them (I6 rule 6). */
  @Test
  public void countsDownTheFiringsLeftOfAFiniteCycle() throws Exception {
    var remaining = new java.util.ArrayList<Long>();
    for (var observation : trace("scenarios/open-rows/timer-recurrence/count-finite-overlap.scenario.json")) {
      for (var wait : waits(observation, "Cycle_Count")) {
        var count = wait.get("detail").get("recurrence").get("remaining").asLong();
        if (remaining.isEmpty() || remaining.getLast() != count) {
          remaining.add(count);
        }
      }
    }
    assertEquals(List.of(3L, 2L, 1L), remaining.subList(0, 3));
  }

  /**
   * Each body's credit check is asynchronous: it arrives when its interview completes (bodies 3, 1, then 2) and CIB
   * begins it only when the runner releases its job (bodies 2, 3, then 1). The kernel counts the checks by arrival, so
   * the open checks are activations 1, 2 and 3 whichever result comes first, and the schedule's `check-3` releases the
   * job of body 2, whose own data its result writes (another job would leave another applicant's name in
   * `lastScreened`).
   */
  @Test
  public void numbersConcurrentPendingChecksByArrivalNotByTheOrderTheirResultsRelease() throws Exception {
    var result = run(PARALLEL_APPLICANTS + "distinct-applicants-reverse-completion.scenario.json");
    var states = new HashMap<String, JsonNode>();
    var commands = 0;
    String command = null;
    for (var observation : result.get("trace")) {
      switch (observation.get("kind").asText()) {
        case "command" -> {
          command = observation.get("commandId").asText();
          assertEquals(command, "committed", observation.get("outcome").asText());
          commands++;
        }
        case "state" -> states.put(command, observation);
        default -> assertEquals("committed", observation.get("outcome").asText());
      }
    }
    assertEquals(8, commands);
    assertEquals(List.of(1L), activations(states.get("s02-interview-3"), "CheckCredit"));
    assertEquals(List.of(1L, 2L), activations(states.get("s03-interview-1"), "CheckCredit"));
    assertEquals(List.of(1L, 2L, 3L), activations(states.get("s04-interview-2"), "CheckCredit"));
    assertEquals(List.of(1L, 2L), activations(states.get("s05-credit-of-body-2-check-3"), "CheckCredit"));
    assertEquals(List.of(2L), activations(states.get("s06-credit-of-body-3-check-1"), "CheckCredit"));
    assertEquals(List.of(), activations(states.get("s07-credit-of-body-1-check-2"), "CheckCredit"));
    assertEquals("Tomas Okafor", variable(states.get("s05-credit-of-body-2-check-3"), "lastScreened"));
    assertEquals("Ines Vidal", variable(states.get("s06-credit-of-body-3-check-1"), "lastScreened"));
    assertEquals("Mara Berger", variable(states.get("s07-credit-of-body-1-check-2"), "lastScreened"));
  }

  /**
   * Two tokens reach one asynchronous Service Task, and the later arrival's job runs first. The job still pending
   * arrived first, so it is activation 1 as the kernel counts it, where begun activity instances plus one would say 2.
   */
  @Test
  public void numbersAPendingWaitByArrivalWhenALaterArrivalRanFirst() {
    try (var arrivals = new Arrivals(configuration -> {})) {
      var jobs = arrivals.pending();
      assertEquals(Map.of(jobs.get(0).getId(), 1L, jobs.get(1).getId(), 2L), arrivals.project());

      arrivals.release(jobs.get(1));

      assertEquals(1L, arrivals.begun());
      assertEquals(Map.of(jobs.get(0).getId(), 1L), arrivals.project());
    }
  }

  /**
   * A lone wait whose earlier arrivals all began keeps the number the begun count gave it: every job that ran has a
   * smaller id than the wait, so the jobs with smaller ids are exactly the begun instances, and the rank is their count
   * plus one.
   */
  @Test
  public void numbersALoneWaitOneMoreThanTheInstancesThatBegan() {
    try (var arrivals = new Arrivals(configuration -> {})) {
      var jobs = arrivals.pending();
      arrivals.project();

      arrivals.release(jobs.get(0));

      assertEquals(1L, arrivals.begun());
      var ranks = arrivals.project();
      assertEquals(Map.of(jobs.get(1).getId(), arrivals.begun() + 1), ranks);
      assertEquals(Map.of(jobs.get(1).getId(), 2L), ranks);
    }
  }

  /** Arrival order is the order of job ids, so ids that are not numbers leave two waits of one element unordered. */
  @Test
  public void failsWhenJobIdsAreNotASequence() {
    var ids = new AtomicLong();
    try (var arrivals =
        new Arrivals(configuration -> configuration.setIdGenerator(() -> "id-" + ids.incrementAndGet()))) {
      var instance = arrivals.observe();
      var job = arrivals.anyJob();

      var failure =
          assertThrows(
              IllegalStateException.class, () -> arrivals.occurrences.pendingActivation(instance, TASK, job));

      assertTrue(failure.getMessage(), failure.getMessage().contains("is not a sequence number"));
    }
  }

  /**
   * A job that runs before any projection has shown it leaves a begun occurrence whose arrival is unknown, so the wait
   * that remains is not numbered by guess.
   */
  @Test
  public void failsWhenABegunOccurrenceHasNoObservedJob() {
    try (var arrivals = new Arrivals(configuration -> {})) {
      arrivals.release(arrivals.pending().getFirst());
      var instance = arrivals.observe();
      var remaining = arrivals.pending().getFirst();

      var failure =
          assertThrows(
              IllegalStateException.class, () -> arrivals.occurrences.pendingActivation(instance, TASK, remaining));

      assertTrue(failure.getMessage(), failure.getMessage().contains("have no observed job"));
    }
  }

  /** CIB's calendars read the JVM default zone, so the oracle refuses to run outside the zone its evidence records. */
  @Test
  public void refusesToRunOutsideUtc() {
    var original = java.util.TimeZone.getDefault();
    try {
      java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Europe/Berlin"));
      assertThrows(IllegalStateException.class, CibSevenScenarioRunner::create);
    } finally {
      java.util.TimeZone.setDefault(original);
    }
  }

  private static JsonNode trace(String scenario) throws Exception {
    return run(scenario).get("trace");
  }

  private static JsonNode run(String scenario) throws Exception {
    try (var runner = CibSevenScenarioRunner.create()) {
      var result =
          runner.run(ScenarioJson.read(PROJECT_ROOT.resolve(scenario)), PROJECT_ROOT,
              CibEffectExecutionSchedule.PLAIN_SUCCESS);
      return new ObjectMapper().readTree(ScenarioJson.write(result));
    }
  }

  private static List<Long> activations(JsonNode observation, String elementId) {
    return waits(observation, elementId).stream()
        .map(wait -> wait.get("id").get("activation").asLong())
        .sorted()
        .toList();
  }

  private static String variable(JsonNode observation, String name) {
    for (var binding : observation.get("variables")) {
      if (name.equals(binding.get("name").asText())) {
        return binding.get("value").get("value").asText();
      }
    }
    throw new AssertionError("state has no variable " + name);
  }

  private static java.util.List<JsonNode> waits(JsonNode observation, String elementId) {
    var found = new java.util.ArrayList<JsonNode>();
    if (observation.has("openWaits")) {
      for (var wait : observation.get("openWaits")) {
        if (elementId.equals(wait.get("id").get("elementId").asText())) {
          found.add(wait);
        }
      }
    }
    return found;
  }

  private static String input(JsonNode wait, String name) {
    for (var binding : wait.get("detail").get("inputs")) {
      if (name.equals(binding.get("name").asText())) {
        return binding.get("value").get("value").asText();
      }
    }
    throw new AssertionError("wait has no input " + name);
  }

  /** A Parallel Gateway sends two tokens along two flows into one asynchronous Service Task: two jobs of an element. */
  private static BpmnModelInstance twoArrivals() {
    var model =
        Bpmn.createExecutableProcess(TWO_ARRIVALS)
            .startEvent("Start")
            .parallelGateway("Fork")
            .serviceTask(TASK).camundaDelegateExpression("${noop}").camundaAsyncBefore()
            .endEvent("End")
            .done();
    model.<ParallelGateway>getModelElementById("Fork").builder().connectTo(TASK);
    return model;
  }

  /** The Process of `twoArrivals` started in its own engine, with the occurrences the runner derives from it. */
  private static final class Arrivals implements AutoCloseable {
    private final ProcessEngine engine;
    private final String deployment;
    private final String instance;
    private final CibSevenOccurrences occurrences;

    private Arrivals(Consumer<ProcessEngineConfigurationImpl> configure) {
      JavaDelegate noop = execution -> {};
      engine =
          CibSevenTestEngine.create(
              "occurrence-arrivals",
              configuration -> {
                configuration.setBeans(Map.of("noop", noop));
                configure.accept(configuration);
              });
      try {
        deployment =
            engine.getRepositoryService().createDeployment().addModelInstance("two-arrivals.bpmn", twoArrivals())
                .deploy().getId();
        instance = engine.getRuntimeService().startProcessInstanceByKey(TWO_ARRIVALS).getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
      occurrences = new CibSevenOccurrences(engine, CibSevenOccurrences::keyAndVersionTag);
    }

    private CibSevenOccurrences.Instance observe() {
      return occurrences.running(instance, "Root").getFirst();
    }

    private Job anyJob() {
      return engine.getManagementService().createJobQuery().processInstanceId(instance).list().getFirst();
    }

    /** The pending jobs in the order CIB created them, which is the numeric order of their ids. */
    private List<Job> pending() {
      return engine.getManagementService().createJobQuery().processInstanceId(instance).list().stream()
          .sorted(Comparator.comparingLong(job -> Long.parseLong(job.getId())))
          .toList();
    }

    /** What a projection publishes for each pending job, keyed by job id, the earliest arrival projected last. */
    private Map<String, Long> project() {
      var observed = observe();
      var activations = new HashMap<String, Long>();
      for (var job : pending().reversed()) {
        activations.put(job.getId(), occurrences.pendingActivation(observed, TASK, job));
      }
      return activations;
    }

    private void release(Job job) {
      engine.getManagementService().executeJob(job.getId());
    }

    private long begun() {
      return engine.getHistoryService().createHistoricActivityInstanceQuery()
          .processInstanceId(instance).activityId(TASK).count();
    }

    @Override
    public void close() {
      engine.getRepositoryService().deleteDeployment(deployment, true, true, true);
      engine.close();
    }
  }
}
