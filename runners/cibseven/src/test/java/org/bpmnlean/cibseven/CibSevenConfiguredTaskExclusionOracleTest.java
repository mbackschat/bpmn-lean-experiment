package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.cibseven.bpm.engine.ProcessEngine;
import org.junit.Test;

/**
 * Retains CIB Seven's public configured-Task pass-through trace only as an exclusion oracle. This
 * is not a CIB target, compatibility result, relationship, or oracle for the project extension's
 * external-effect semantics.
 */
public final class CibSevenConfiguredTaskExclusionOracleTest {

  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path APPROVED_SOURCE =
      PROJECT_ROOT.resolve("packages/bpmn-source/test/fixtures/configured-task.bpmn");
  private static final String RESOURCE_NAME =
      "CibSevenConfiguredTaskExclusionOracleTest.bpmn";
  private static final String PROCESS_ID = "Process_ConfiguredTask";
  private static final String USER_TASK_ID = "UserTask_Review";

  @Test
  public void retainsImmediateUserTaskExposureAsAnExclusionOracle() throws Exception {
    var source = readResource();
    assertEquals(Files.readString(APPROVED_SOURCE), source);

    var engine = CibSevenTestEngine.create("configured-task-exclusion-oracle");
    String deploymentId = null;
    try {
      deploymentId =
          engine
              .getRepositoryService()
              .createDeployment()
              .addString(RESOURCE_NAME, source)
              .deploy()
              .getId();
      var processInstance =
          engine.getRuntimeService().startProcessInstanceByKey(PROCESS_ID);
      var expectedAfterStart =
          new PublicState(1, List.of(USER_TASK_ID), 0, 0);
      var afterStart = projectPublicState(engine, processInstance.getId());
      assertEquals(expectedAfterStart, afterStart);

      var userTask =
          engine
              .getTaskService()
              .createTaskQuery()
              .processInstanceId(processInstance.getId())
              .singleResult();
      assertNotNull(userTask);

      engine.getTaskService().complete(userTask.getId());

      var trace =
          new PassThroughTrace(
              afterStart,
              projectPublicState(engine, processInstance.getId()));
      assertEquals(
          new PassThroughTrace(
              expectedAfterStart,
              new PublicState(0, List.of(), 0, 0)),
          trace);
    } finally {
      try {
        if (deploymentId != null) {
          engine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
        }
        requireClean(engine);
      } finally {
        engine.close();
      }
    }
  }

  private static PublicState projectPublicState(
      ProcessEngine engine, String processInstanceId) {
    var taskElementIds =
        engine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(processInstanceId)
            .list()
            .stream()
            .map(task -> task.getTaskDefinitionKey())
            .sorted()
            .toList();
    return new PublicState(
        engine
            .getRuntimeService()
            .createProcessInstanceQuery()
            .processInstanceId(processInstanceId)
            .count(),
        taskElementIds,
        engine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(processInstanceId)
            .count(),
        engine
            .getRuntimeService()
            .createIncidentQuery()
            .processInstanceId(processInstanceId)
            .count());
  }

  private static void requireClean(ProcessEngine engine) {
    assertEquals(0, engine.getRepositoryService().createDeploymentQuery().count());
    assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().count());
    assertEquals(0, engine.getTaskService().createTaskQuery().count());
    assertEquals(0, engine.getManagementService().createJobQuery().count());
    assertEquals(0, engine.getRuntimeService().createIncidentQuery().count());
    assertEquals(
        0,
        engine
            .getHistoryService()
            .createHistoricProcessInstanceQuery()
            .count());
    assertEquals(
        0,
        engine
            .getHistoryService()
            .createHistoricActivityInstanceQuery()
            .count());
    assertEquals(
        0,
        engine
            .getHistoryService()
            .createHistoricVariableInstanceQuery()
            .count());
  }

  private static String readResource() throws IOException {
    try (var stream =
        CibSevenConfiguredTaskExclusionOracleTest.class.getResourceAsStream(RESOURCE_NAME)) {
      if (stream == null) {
        throw new IOException("Missing configured Task exclusion resource");
      }
      return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private record PublicState(
      long processInstances,
      List<String> taskElementIds,
      long jobs,
      long incidents) {}

  private record PassThroughTrace(
      PublicState afterStart,
      PublicState afterUserTaskCompletion) {}
}
