package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates the Activity host specification's `CIB-AGR-0020` (`ACTH-MERGE-01`) on its claim review model and its Link twin.
 * CIB Seven `2.2.0` enters a transition's destination without consulting its other incoming transitions
 * (`AbstractPvmAtomicOperationTransitionNotifyListenerTake.java:34-51`), so each token arriving at a User Task inserts
 * one task (`UserTaskActivityBehavior.java:54-62`) and each arriving at a Service Task invokes its delegate once
 * (`ServiceTaskDelegateExpressionActivityBehavior.java:101-119`). Per journey, the merging Task has one historic activity
 * instance per arrival, each with its own id, and nothing waits for or records the merge; in the Link twin no Link Event
 * has a historic instance. Conditions are rendered as JUEL under `CIB-CFG-0005`, so the probe compares activations, never
 * condition truth. Expected values are built from the proposal's witness-model account, never read from a target result.
 */
public final class CibSevenActivityHostMergeProbeTest {
  private static final Path MODELS = Path.of("../..").toAbsolutePath().normalize().resolve("scenarios/activity-host-merge");
  private static final Pattern STRING_EQUALS = Pattern.compile("stringEquals\\((\\w+),\"([^\"]*)\"\\)");
  private static final String SIMPLE_BOOLEAN = " expressionLanguage=\"urn:bpmn-lean:expression:simple-boolean:v1\"";

  /** A deployment of the claim review whose three delegates write their next queued local result. */
  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session(List<String> routes, List<String> outcomes, UnaryOperator<String> edit) throws Exception {
      var routeQueue = new ArrayDeque<>(routes);
      var outcomeQueue = new ArrayDeque<>(outcomes);
      JavaDelegate triage = execution -> execution.setVariableLocal("route", routeQueue.remove());
      JavaDelegate expert = execution -> execution.setVariableLocal("opinion", "covered: storm exclusion does not apply");
      JavaDelegate fetch = execution -> execution.setVariableLocal("outcome", outcomeQueue.remove());
      engine = CibSevenTestEngine.create("activity-host-merge", configuration -> configuration.setBeans(
          Map.<Object, Object>of("triageClaim", triage, "obtainExpertOpinion", expert, "fetchReviewOutcome", fetch)));
      try {
        var source = edit.apply(Files.readString(MODELS.resolve("claim-review.bpmn")));
        assertEquals(2, STRING_EQUALS.matcher(source).results().count());
        var rendition = STRING_EQUALS.matcher(source.replace(SIMPLE_BOOLEAN, "")).replaceAll("\\${$1 == \"$2\"}");
        deployment = engine.getRepositoryService().createDeployment().addString("claim-review.bpmn", rendition).deploy()
            .getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start() {
      return engine.getRuntimeService().startProcessInstanceByKey("Process_ClaimReview",
          new HashMap<>(Map.of("claimSummary", "CLM-12: storm damage to roof, EUR 6,400"))).getId();
    }

    /** Runs the one open asynchronous continuation, which belongs to `element`. */
    void runJob(String instance, String element) {
      var jobs = engine.getManagementService().createJobQuery().processInstanceId(instance);
      assertEquals(element, 1, jobs.count());
      var job = jobs.activityId(element).singleResult();
      assertNotNull(element, job);
      engine.getManagementService().executeJob(job.getId());
    }

    /** *Review claim* is the only open task; completes it. */
    void review(String instance) {
      var tasks = engine.getTaskService().createTaskQuery().processInstanceId(instance).list();
      assertEquals(1, tasks.size());
      assertEquals("ReviewClaim", tasks.get(0).getTaskDefinitionKey());
      engine.getTaskService().complete(tasks.get(0).getId());
    }

    /** The element's historic activity instances: exactly `count`, pairwise distinct. */
    void assertActivations(String instance, String element, int count) {
      var all = engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance)
          .activityId(element).list();
      assertEquals(element, count, all.size());
      for (var left = 0; left < all.size(); left++) {
        for (var right = left + 1; right < all.size(); right++) {
          assertNotEquals(element, all.get(left).getId(), all.get(right).getId());
        }
      }
    }

    void assertEnded(String instance) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).count());
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deployment, true, true, true);
      } finally {
        engine.close();
      }
    }
  }

  /** Both flows into *Obtain expert opinion* as throws of one Link name whose catch leads to it, as the source test edits. */
  private static String linkTwin(String source) {
    return source
        .replace("<sequenceFlow id=\"Flow_ToExpert\" sourceRef=\"ExpertNeeded\" targetRef=\"ObtainExpertOpinion\">",
            "<sequenceFlow id=\"Flow_ToExpert\" sourceRef=\"ExpertNeeded\" targetRef=\"ThrowToExpert\">")
        .replace("<sequenceFlow id=\"Flow_Reopen\" sourceRef=\"Reopen\" targetRef=\"ObtainExpertOpinion\">",
            "<sequenceFlow id=\"Flow_Reopen\" sourceRef=\"Reopen\" targetRef=\"ThrowReopenToExpert\">")
        .replace("<endEvent id=\"ClaimDecided\" name=\"Claim decided\" />", "<endEvent id=\"ClaimDecided\" name=\"Claim decided\" />"
            + throwOf("ThrowToExpert") + throwOf("ThrowReopenToExpert")
            + "<intermediateCatchEvent id=\"CatchToExpert\" name=\"To expert\"><linkEventDefinition name=\"ToExpert\" />"
            + "</intermediateCatchEvent>"
            + "<sequenceFlow id=\"Flow_ExpertCaught\" sourceRef=\"CatchToExpert\" targetRef=\"ObtainExpertOpinion\" />");
  }

  private static String throwOf(String id) {
    return "<intermediateThrowEvent id=\"" + id + "\" name=\"To expert\"><linkEventDefinition name=\"ToExpert\" />"
        + "</intermediateThrowEvent>";
  }

  @Test
  public void theDirectClaimOpensTheReviewOnceFromTheChoice() throws Exception {
    try (var session = new Session(List.of("direct"), List.of("accept"), UnaryOperator.identity())) {
      var instance = session.start();
      session.runJob(instance, "TriageClaim");
      session.review(instance);
      session.runJob(instance, "FetchReviewOutcome");
      session.assertEnded(instance);
      session.assertActivations(instance, "ReviewClaim", 1);
      session.assertActivations(instance, "ObtainExpertOpinion", 0);
    }
  }

  @Test
  public void theExpertOpinionOpensTheReviewOnceThroughItsOtherIncomingFlow() throws Exception {
    try (var session = new Session(List.of("expert"), List.of("accept"), UnaryOperator.identity())) {
      var instance = session.start();
      session.runJob(instance, "TriageClaim");
      session.runJob(instance, "ObtainExpertOpinion");
      session.review(instance);
      session.runJob(instance, "FetchReviewOutcome");
      session.assertEnded(instance);
      session.assertActivations(instance, "ReviewClaim", 1);
      session.assertActivations(instance, "ObtainExpertOpinion", 1);
    }
  }

  @Test
  public void aReopenedDirectClaimReviewsTwiceWithAFreshActivation() throws Exception {
    for (var edit : List.<UnaryOperator<String>>of(UnaryOperator.identity(), CibSevenActivityHostMergeProbeTest::linkTwin)) {
      try (var session = new Session(List.of("direct"), List.of("reopen", "accept"), edit)) {
        var instance = session.start();
        session.runJob(instance, "TriageClaim");
        session.review(instance);
        session.runJob(instance, "FetchReviewOutcome");
        session.runJob(instance, "ObtainExpertOpinion");
        session.review(instance);
        session.runJob(instance, "FetchReviewOutcome");
        session.assertEnded(instance);
        session.assertActivations(instance, "ReviewClaim", 2);
        session.assertActivations(instance, "ObtainExpertOpinion", 1);
        for (var link : List.of("ThrowToExpert", "ThrowReopenToExpert", "CatchToExpert")) {
          session.assertActivations(instance, link, 0);
        }
      }
    }
  }
}
