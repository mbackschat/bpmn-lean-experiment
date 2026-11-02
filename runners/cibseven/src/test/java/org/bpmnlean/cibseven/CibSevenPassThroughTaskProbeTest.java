package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.history.HistoricActivityInstance;
import org.junit.Test;

/**
 * Calibrates the pass-through Task proposal's `CIB-EXT-0022` (`PTT-PASS-01`, `PTT-FRESH-01`) on its two witness models:
 * CIB Seven `2.2.0` runs a plain Task and a Manual Task through `TaskActivityBehavior.leave` (BpmnParse.java:2711-2739),
 * so each activation is a historic activity instance of type `task` or `manualTask` that ends inside the command that
 * reached it, with no task entity and no job. CIB does not execute the project's Simple Boolean v1 conditions, so each
 * condition is rendered as JUEL under `CIB-CFG-0005` before deployment; the probe compares activations, never condition
 * truth. Expected values are built here from the proposal's witness-model account, never read from a target result.
 */
public final class CibSevenPassThroughTaskProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODELS = PROJECT_ROOT.resolve("scenarios/pass-through-task");
  private static final Pattern STRING_EQUALS = Pattern.compile("stringEquals\\((\\w+),\"([^\"]*)\"\\)");
  private static final String SIMPLE_BOOLEAN = " expressionLanguage=\"urn:bpmn-lean:expression:simple-boolean:v1\"";

  @Test
  public void theManualTaskInsideTheInspectionAndTheClosingTaskPassThroughWithoutWaiting() throws Exception {
    try (var session = new Session("equipment-return", 0, "refundDeposit")) {
      var instance = session.start("Process_EquipmentReturn");
      session.complete(instance, "SchedulePickup");
      session.assertPassedThrough(instance, "UnpackEquipment", "manualTask", 1);
      session.assertOnlyOpenTask(instance, "RecordCondition");

      session.complete(instance, "RecordCondition");
      session.assertPassedThrough(instance, "CloseReturnTicket", "task", 0);
      session.runJob(instance);
      session.assertPassedThrough(instance, "CloseReturnTicket", "task", 1);
      session.assertEnded(instance);
    }
  }

  @Test
  public void twoIllegibleCopiesReenterTheManualTaskWithFreshActivationsBeforeThePaperIsFiled() throws Exception {
    try (var session = new Session("document-intake", 2, "indexArchiveLocation")) {
      var instance = session.start("Process_DocumentIntake");
      for (var attempt = 0; attempt < 2; attempt++) {
        session.complete(instance, "ClassifyDocument", Map.of("format", "illegible"));
        session.assertPassedThrough(instance, "PhoneSender", "manualTask", 1);
        session.assertOnlyOpenTask(instance, "ClassifyDocument");
      }
      session.complete(instance, "ClassifyDocument", Map.of("format", "paper"));
      session.assertPassedThrough(instance, "PhoneSender", "manualTask", 0);
      session.assertPassedThrough(instance, "FilePaperOriginal", "manualTask", 1);
      session.runJob(instance);
      session.assertEnded(instance);
      assertEquals(2, session.activations(instance, "PhoneSender").size());
    }
  }

  @Test
  public void aDigitalCopyTakesTheDefaultBranchThroughThePlainTask() throws Exception {
    try (var session = new Session("document-intake", 2, "indexArchiveLocation")) {
      var instance = session.start("Process_DocumentIntake");
      session.complete(instance, "ClassifyDocument", Map.of("format", "digital"));
      session.assertPassedThrough(instance, "RegisterDigitalCopy", "task", 1);
      session.assertPassedThrough(instance, "FilePaperOriginal", "manualTask", 0);
      session.assertEnded(instance);
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    /** `handler` names the model's one Service Task delegate, a no-op: the probe observes Tasks, not effects. */
    Session(String model, int conditions, String handler) throws Exception {
      JavaDelegate noOp = execution -> { };
      engine = CibSevenTestEngine.create("pass-through-task-" + model,
          configuration -> configuration.setBeans(Map.<Object, Object>of(handler, noOp)));
      try {
        var source = Files.readString(MODELS.resolve(model + ".bpmn"));
        assertEquals(conditions, STRING_EQUALS.matcher(source).results().count());
        var rendition = STRING_EQUALS.matcher(source.replace(SIMPLE_BOOLEAN, "")).replaceAll("\\${$1 == \"$2\"}");
        deployment = engine.getRepositoryService().createDeployment().addString(model + ".bpmn", rendition).deploy()
            .getId();
      } catch (Exception | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(String processId) {
      return engine.getRuntimeService().startProcessInstanceByKey(processId).getId();
    }

    /** Runs the one open asynchronous continuation before the next command. */
    void runJob(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    void complete(String instance, String element) {
      complete(instance, element, Map.of());
    }

    void complete(String instance, String element, Map<String, Object> variables) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance).taskDefinitionKey(element)
          .singleResult();
      assertNotNull(task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(variables));
    }

    /**
     * The element's activations since the previous call for it are exactly `fresh` historic instances of `type`, each
     * already ended by the command just run, and the engine holds no task entity and no job for it. Returns those fresh
     * activations.
     */
    List<HistoricActivityInstance> assertPassedThrough(String instance, String element, String type, int fresh) {
      var all = activations(instance, element);
      var seen = seenCounts.getOrDefault(element, 0);
      var added = all.subList(seen, all.size());
      seenCounts.put(element, all.size());
      assertEquals(element, fresh, added.size());
      for (var activation : added) {
        assertEquals(element, type, activation.getActivityType());
        assertNotNull(element, activation.getEndTime());
      }
      for (var left = 0; left < all.size(); left++) {
        for (var right = left + 1; right < all.size(); right++) {
          assertNotEquals(element, all.get(left).getId(), all.get(right).getId());
        }
      }
      assertEquals(element, 0, engine.getTaskService().createTaskQuery().processInstanceId(instance)
          .taskDefinitionKey(element).count());
      assertEquals(element, 0, engine.getManagementService().createJobQuery().processInstanceId(instance)
          .activityId(element).count());
      return added;
    }

    private final Map<String, Integer> seenCounts = new HashMap<>();

    void assertOnlyOpenTask(String instance, String element) {
      var tasks = engine.getTaskService().createTaskQuery().processInstanceId(instance).list();
      assertEquals(1, tasks.size());
      assertEquals(element, tasks.get(0).getTaskDefinitionKey());
    }

    List<HistoricActivityInstance> activations(String instance, String element) {
      return engine.getHistoryService().createHistoricActivityInstanceQuery().processInstanceId(instance)
          .activityId(element).orderPartiallyByOccurrence().asc().list();
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
}
