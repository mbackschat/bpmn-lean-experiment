package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.task.Task;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * Calibrates the public CIB Seven 2.2 lifecycle for exact-code Error propagation out of an
 * interrupting embedded Sub-Process before the project implements the selected semantics.
 */
public final class CibSevenSubProcessErrorPropagationPhaseZeroProbeTest {

  private static final Path PROJECT_ROOT =
      Path.of("../..").toAbsolutePath().normalize();
  private static final Path RESOURCE =
      PROJECT_ROOT.resolve("scenarios/subprocess-error-propagation/process.bpmn");
  private static final String PROCESS_ID = "Process_SubProcessErrorPropagationProbe";
  private static final String TRIGGER_ERROR = "UserTask_TriggerError";
  private static final String SIBLING_WORK = "UserTask_SiblingWork";
  private static final String RECOVER = "UserTask_Recover";
  private static ProcessEngine engine;

  @BeforeClass
  public static void createEngine() {
    engine = CibSevenTestEngine.create("subprocess-error-propagation-phase-zero");
  }

  @AfterClass
  public static void closeEngine() {
    engine.close();
  }

  @Test
  public void triggerFirstInterruptsTheSiblingAndSelectsRecovery() throws Exception {
    try (var deployment = ProbeDeployment.open(engine)) {
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var processInstanceId = processInstance.getId();

      assertRunningWithTasks(processInstanceId, SIBLING_WORK, TRIGGER_ERROR);
      complete(processInstanceId, TRIGGER_ERROR);

      assertRunningWithTasks(processInstanceId, RECOVER);
      complete(processInstanceId, RECOVER);

      assertCompletedWithNoTasks(processInstanceId);
    }
  }

  @Test
  public void siblingFirstStillSelectsRecoveryWhenTheErrorIsLaterTriggered()
      throws Exception {
    try (var deployment = ProbeDeployment.open(engine)) {
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var processInstanceId = processInstance.getId();

      assertRunningWithTasks(processInstanceId, SIBLING_WORK, TRIGGER_ERROR);
      complete(processInstanceId, SIBLING_WORK);
      assertRunningWithTasks(processInstanceId, TRIGGER_ERROR);

      complete(processInstanceId, TRIGGER_ERROR);
      assertRunningWithTasks(processInstanceId, RECOVER);

      complete(processInstanceId, RECOVER);
      assertCompletedWithNoTasks(processInstanceId);
    }
  }

  private static void assertRunningWithTasks(
      String processInstanceId, String... taskDefinitionKeys) {
    assertEquals(
        1,
        engine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(processInstanceId)
            .count());
    assertEquals(
        Arrays.stream(taskDefinitionKeys).sorted().toList(),
        activeTaskKeys(processInstanceId));
  }

  private static void assertCompletedWithNoTasks(String processInstanceId) {
    assertEquals(
        0,
        engine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(processInstanceId)
            .count());
    assertEquals(List.of(), activeTaskKeys(processInstanceId));
  }

  private static void complete(String processInstanceId, String taskDefinitionKey) {
    var task =
        engine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey(taskDefinitionKey)
            .singleResult();
    assertNotNull(task);
    engine.getTaskService().complete(task.getId());
  }

  private static List<String> activeTaskKeys(String processInstanceId) {
    return engine
        .getTaskService()
        .createTaskQuery()
        .processInstanceId(processInstanceId)
        .list()
        .stream()
        .map(Task::getTaskDefinitionKey)
        .sorted()
        .toList();
  }

  private static String readResource() throws IOException {
    return Files.readString(RESOURCE);
  }

  private record ProbeDeployment(ProcessEngine owner, String deploymentId)
      implements AutoCloseable {

    private static ProbeDeployment open(ProcessEngine engine) throws IOException {
      var deployment =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString("subprocess-error-propagation-phase-zero.bpmn", readResource())
              .deploy();
      return new ProbeDeployment(engine, deployment.getId());
    }

    @Override
    public void close() {
      owner
          .getRepositoryService()
          .deleteDeployment(deploymentId, true, true, true);
    }
  }
}
