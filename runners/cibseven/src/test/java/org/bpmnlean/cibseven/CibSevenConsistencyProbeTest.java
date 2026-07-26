package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;

import java.nio.file.Files;
import java.nio.file.Path;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.junit.Test;

public final class CibSevenConsistencyProbeTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path BPMN_PATH =
      PROJECT_ROOT.resolve("scenarios/user-task-discovery-completion/process.bpmn");
  private static final String PROCESS_ID = "Process_SequentialUserTask";

  @Test
  public void refusesGeneratedTaskIdAfterTaskCeasesToBeLive() throws Exception {
    var engine = CibSevenTestEngine.create("cibseven-consistency-probe");
    String deploymentId = null;
    try {
      try (var bpmn = Files.newInputStream(BPMN_PATH)) {
        deploymentId =
            engine
                .getRepositoryService()
                .createDeployment()
                .addInputStream(BPMN_PATH.getFileName().toString(), bpmn)
                .deploy()
                .getId();
      }

      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var task =
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .singleResult();
      assertNotNull(task);

      var generatedTaskId = task.getId();
      engine.getTaskService().complete(generatedTaskId);
      assertEquals(
          0,
          engine
              .getTaskService()
              .createTaskQuery()
              .taskId(generatedTaskId)
              .count());

      assertThrows(
          ProcessEngineException.class,
          () -> engine.getTaskService().complete(generatedTaskId));
      assertEquals(
          0,
          engine
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstance.getId())
              .count());
    } finally {
      if (deploymentId != null) {
        engine
            .getRepositoryService()
            .deleteDeployment(deploymentId, true, true, true);
      }
      engine.close();
    }
  }
}
