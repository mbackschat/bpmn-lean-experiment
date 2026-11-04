package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.bpmnlean.cibseven.CibSevenPassThroughTaskProbeTest.Session;
import org.junit.Test;

/**
 * Calibrates the Link Events proposal's `CIB-AGR-0018` (`LNK-CONT-01`) on its two witness models. CIB Seven `2.2.0` creates
 * no activity for a Link throw and retargets every flow into it to the catch of its name (`BpmnParse.java:1611-1622`,
 * `4306-4316`), whose behavior leaves at once and writes no history (`HistoryParseListener.java:207-211`). The oracle is
 * each model's explicit-flow twin in `scenarios/none-intermediate-throw`: every journey runs on both deployments, and after
 * each command the two hold the same set of open User Tasks and jobs, compared as sets because a Link adds PVM operations
 * inside one transaction on Parallel branches. No historic activity instance may name a Link Event. Conditions are rendered
 * as JUEL under `CIB-CFG-0005` by the shared session, which compares activations, never condition truth.
 */
public final class CibSevenLinkEventsProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path LINK_MODELS = PROJECT_ROOT.resolve("scenarios/link-events");
  private static final Path TWIN_MODELS = PROJECT_ROOT.resolve("scenarios/none-intermediate-throw");
  private static final List<String> WARRANTY_LINKS = List.of("ThrowBackToRepair", "CatchBackToRepair", "ThrowToTesting",
      "CatchToTesting", "ThrowReleaseDevice", "CatchReleaseDevice");
  private static final List<String> ONBOARDING_LINKS = List.of("ThrowWelcomeTrack", "CatchWelcomeTrack", "ThrowAccountDone",
      "CatchAccountDone", "ThrowAllSet", "CatchAllSet");

  /** One journey step: complete the named User Task with `variables`, or run the one open job when `element` is null. */
  private record Step(String element, Map<String, Object> variables) {
    static Step complete(String element) {
      return new Step(element, Map.of());
    }

    static Step complete(String element, Map<String, Object> variables) {
      return new Step(element, variables);
    }

    static Step runJob() {
      return new Step(null, Map.of());
    }
  }

  private static void apply(Session session, String instance, Step step) {
    if (step.element() == null) {
      session.runJob(instance);
    } else {
      session.complete(instance, step.element(), step.variables());
    }
  }

  private static List<String> openTasks(Session session, String instance) {
    return session.engine.getTaskService().createTaskQuery().processInstanceId(instance).list().stream()
        .map(task -> task.getTaskDefinitionKey()).sorted().toList();
  }

  private static long jobs(Session session, String instance) {
    return session.engine.getManagementService().createJobQuery().processInstanceId(instance).count();
  }

  /** Runs `steps` on the Link model and its twin and returns the Link instance's activation count of `counted`. */
  private static int journey(String twin, int conditions, String handler, String result, Object value, String processId,
      Map<String, Object> variables, List<String> links, String counted, List<Step> steps) throws Exception {
    try (var linked = new Session(LINK_MODELS, twin + "-links", conditions, handler, result, value);
        var plain = new Session(TWIN_MODELS, twin, conditions, handler, result, value)) {
      var linkedInstance = linked.start(processId, variables);
      var plainInstance = plain.start(processId, variables);
      for (var step : steps) {
        assertEquals(step.toString(), openTasks(plain, plainInstance), openTasks(linked, linkedInstance));
        assertEquals(step.toString(), jobs(plain, plainInstance), jobs(linked, linkedInstance));
        apply(linked, linkedInstance, step);
        apply(plain, plainInstance, step);
      }
      linked.assertEnded(linkedInstance);
      plain.assertEnded(plainInstance);
      for (var link : links) assertEquals(link, 0, linked.activations(linkedInstance, link).size());
      return linked.activations(linkedInstance, counted).size();
    }
  }

  @Test
  public void aPassingRepairRunsAsItsTwinAcrossTheBodyAndCandidateLinks() throws Exception {
    var replacements = journey("warranty-repair", 1, "orderSparePart", null, null, "Process_WarrantyRepair",
        Map.of("device", "DEV-7"), WARRANTY_LINKS, "ReplacePart", List.of(Step.complete("DiagnoseFault"),
            Step.complete("ReplacePart"), Step.runJob(), Step.complete("TestDevice", Map.of("result", "passed"))));
    assertEquals(1, replacements);
  }

  @Test
  public void aFailedTestCrossesTheGoToLoopOnceAsItsTwinReentersTheRepair() throws Exception {
    var replacements = journey("warranty-repair", 1, "orderSparePart", null, null, "Process_WarrantyRepair",
        Map.of("device", "DEV-7"), WARRANTY_LINKS, "ReplacePart", List.of(Step.complete("DiagnoseFault"),
            Step.complete("ReplacePart"), Step.runJob(), Step.complete("TestDevice", Map.of("result", "failed")),
            Step.complete("ReplacePart"), Step.runJob(), Step.complete("TestDevice", Map.of("result", "passed"))));
    assertEquals(2, replacements);
  }

  @Test
  public void theAccountFirstOnboardingRunsAsItsTwinAcrossTheBranchBodyAndJoinLinks() throws Exception {
    journey("onboarding-milestones", 0, "orderLaptop", "order", "LAP-1", "Process_OnboardingMilestones",
        Map.of("employee", "EMP-4"), ONBOARDING_LINKS, "CreateAccount", List.of(Step.complete("ConfirmStartDate"),
            Step.complete("CreateAccount"), Step.runJob()));
  }

  @Test
  public void theLaptopFirstOnboardingRunsAsItsTwinAcrossTheBranchBodyAndJoinLinks() throws Exception {
    journey("onboarding-milestones", 0, "orderLaptop", "order", "LAP-1", "Process_OnboardingMilestones",
        Map.of("employee", "EMP-4"), ONBOARDING_LINKS, "CreateAccount", List.of(Step.complete("ConfirmStartDate"),
            Step.runJob(), Step.complete("CreateAccount")));
  }
}
