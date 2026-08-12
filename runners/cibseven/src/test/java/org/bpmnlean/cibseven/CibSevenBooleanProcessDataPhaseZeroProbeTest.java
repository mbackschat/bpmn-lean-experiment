package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.task.Task;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.junit.Test;

/**
 * Calibrates Boolean process data at the public CIB Seven 2.2 User Task completion boundary.
 */
public final class CibSevenBooleanProcessDataPhaseZeroProbeTest {

  private static final String RESOURCE =
      "org/bpmnlean/cibseven/CibSevenBooleanProcessDataPhaseZeroProbeTest.bpmn";
  private static final String PROCESS_ID = "Process_BooleanCompletionDataProbe";
  private static final String INPUT_TASK = "UserTask_Input";
  private static final String OBSERVE_TASK = "UserTask_Observe";

  @Test
  public void booleanCompletionValueKeepsItsTypeThroughContinuationAndHistory() {
    try (var session = ProbeSession.open("user-task-boolean-completion-data")) {
      var initial = new LinkedHashMap<String, Object>();
      initial.put("existing", "before");
      initial.put("cleared", null);
      var processInstance =
          session.engine().getRuntimeService().startProcessInstanceByKey(PROCESS_ID, initial);
      var inputTask = requireTask(session.engine(), processInstance.getId(), INPUT_TASK);
      var submitted = Map.<String, Object>of(
          "approved", Boolean.TRUE,
          "control", "kept-as-string");

      session.engine().getTaskService().complete(inputTask.getId(), submitted);
      var observeTask = requireTask(session.engine(), processInstance.getId(), OBSERVE_TASK);
      var taskVariables =
          snapshot(session.engine().getTaskService().getVariables(observeTask.getId()));
      var runtimeVariables = runtimeVariables(session.engine(), processInstance.getId());

      assertBooleanTrue(taskVariables.get("approved"));
      assertBooleanTrue(runtimeVariables.get("approved"));
      assertEquals("kept-as-string", taskVariables.get("control"));
      assertEquals("kept-as-string", runtimeVariables.get("control"));
      assertEquals("before", runtimeVariables.get("existing"));
      assertTrue(runtimeVariables.containsKey("cleared"));
      assertEquals(null, runtimeVariables.get("cleared"));

      session.engine().getTaskService().complete(observeTask.getId());
      var historicVariables = historicVariables(session.engine(), processInstance.getId());

      assertBooleanTrue(historicVariables.get("approved"));
      assertEquals("kept-as-string", historicVariables.get("control"));
      assertEquals(
          0,
          session
              .engine()
              .getRuntimeService()
              .createProcessInstanceQuery()
              .processInstanceId(processInstance.getId())
              .count());
    }
  }

  @Test
  public void noDataCompletionPreservesExistingStringAndNullValues() {
    try (var session = ProbeSession.open("user-task-boolean-no-data-control")) {
      var initial = new LinkedHashMap<String, Object>();
      initial.put("existing", "before");
      initial.put("cleared", null);
      var processInstance =
          session.engine().getRuntimeService().startProcessInstanceByKey(PROCESS_ID, initial);
      var inputTask = requireTask(session.engine(), processInstance.getId(), INPUT_TASK);

      session.engine().getTaskService().complete(inputTask.getId());
      var observeTask = requireTask(session.engine(), processInstance.getId(), OBSERVE_TASK);

      assertEquals(
          initial,
          snapshot(session.engine().getTaskService().getVariables(observeTask.getId())));
    }
  }

  @Test
  public void unknownAndStaleTaskIdsPreserveBooleanCompletionState() {
    try (var session = ProbeSession.open("user-task-boolean-completion-refusal")) {
      var initial = Map.<String, Object>of("guard", "kept");
      var processInstance =
          session.engine().getRuntimeService().startProcessInstanceByKey(PROCESS_ID, initial);
      var inputTask = requireTask(session.engine(), processInstance.getId(), INPUT_TASK);

      assertThrows(
          ProcessEngineException.class,
          () ->
              session
                  .engine()
                  .getTaskService()
                  .complete("missing-task-id", Map.of("approved", Boolean.TRUE)));
      assertEquals(initial, runtimeVariables(session.engine(), processInstance.getId()));
      assertEquals(List.of(INPUT_TASK), activeTaskKeys(session.engine(), processInstance.getId()));

      session
          .engine()
          .getTaskService()
          .complete(inputTask.getId(), Map.of("approved", Boolean.TRUE));
      var committed = Map.<String, Object>of("approved", Boolean.TRUE, "guard", "kept");
      assertEquals(committed, runtimeVariables(session.engine(), processInstance.getId()));

      assertThrows(
          ProcessEngineException.class,
          () ->
              session
                  .engine()
                  .getTaskService()
                  .complete(inputTask.getId(), Map.of("approved", Boolean.FALSE)));
      var afterRefusal = runtimeVariables(session.engine(), processInstance.getId());
      assertEquals(committed, afterRefusal);
      assertBooleanTrue(afterRefusal.get("approved"));
      assertEquals(List.of(OBSERVE_TASK), activeTaskKeys(session.engine(), processInstance.getId()));
    }
  }

  private static void assertBooleanTrue(Object value) {
    assertTrue(value instanceof Boolean);
    assertEquals(Boolean.TRUE, value);
    assertFalse("true".equals(value));
  }

  private static Task requireTask(
      ProcessEngine engine, String processInstanceId, String taskDefinitionKey) {
    var task =
        engine
            .getTaskService()
            .createTaskQuery()
            .processInstanceId(processInstanceId)
            .taskDefinitionKey(taskDefinitionKey)
            .singleResult();
    assertNotNull(task);
    return task;
  }

  private static List<String> activeTaskKeys(ProcessEngine engine, String processInstanceId) {
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

  private static Map<String, Object> runtimeVariables(
      ProcessEngine engine, String processInstanceId) {
    return snapshot(engine.getRuntimeService().getVariables(processInstanceId));
  }

  private static Map<String, Object> historicVariables(
      ProcessEngine engine, String processInstanceId) {
    var values = new LinkedHashMap<String, Object>();
    engine
        .getHistoryService()
        .createHistoricVariableInstanceQuery()
        .processInstanceId(processInstanceId)
        .list()
        .stream()
        .sorted(java.util.Comparator.comparing(variable -> variable.getName()))
        .forEach(variable -> values.put(variable.getName(), variable.getValue()));
    return Collections.unmodifiableMap(values);
  }

  private static Map<String, Object> snapshot(Map<String, Object> variables) {
    return Collections.unmodifiableMap(new LinkedHashMap<>(variables));
  }

  private static BpmnModelInstance completionDataProcess() {
    return Bpmn.createExecutableProcess(PROCESS_ID)
        .startEvent("StartEvent_Probe")
        .userTask(INPUT_TASK)
        .userTask(OBSERVE_TASK)
        .endEvent("EndEvent_Probe")
        .done();
  }

  private record ProbeSession(ProcessEngine engine, String deploymentId) implements AutoCloseable {

    private static ProbeSession open(String name) {
      var engine = CibSevenTestEngine.create(name);
      try {
        var deployment =
            engine
                .getRepositoryService()
                .createDeployment()
                .addModelInstance(RESOURCE, completionDataProcess())
                .deploy();
        return new ProbeSession(engine, deployment.getId());
      } catch (Exception error) {
        engine.close();
        throw new IllegalStateException("Cannot deploy the Boolean completion-data probe", error);
      }
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deploymentId, true, true, true);
      } finally {
        engine.close();
      }
    }
  }
}
