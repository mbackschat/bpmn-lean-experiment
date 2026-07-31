package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;

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
 * Calibrates the public CIB Seven 2.2 User Task completion-variable boundary before the project
 * selects compatible semantic meaning.
 */
public final class CibSevenUserTaskCompletionDataPhaseZeroProbeTest {

  private static final String RESOURCE =
      "org/bpmnlean/cibseven/CibSevenUserTaskCompletionDataPhaseZeroProbeTest.bpmn";
  private static final String PROCESS_ID = "Process_UserTaskCompletionDataProbe";
  private static final String INPUT_TASK = "UserTask_Input";
  private static final String OBSERVE_TASK = "UserTask_Observe";

  @Test
  public void exposesProcessVariablesAndCommitsTheSubmittedPatchBeforeContinuation() {
    try (var session = ProbeSession.open("user-task-completion-data")) {
      var initial = Map.<String, Object>of(
          "existing", "before",
          "unrelated", "kept");
      var processInstance =
          session.engine().getRuntimeService().startProcessInstanceByKey(PROCESS_ID, initial);
      var inputTask = requireTask(session.engine(), processInstance.getId(), INPUT_TASK);
      var submitted = new LinkedHashMap<String, Object>();
      submitted.put("created", "yes");
      submitted.put("existing", "after");
      submitted.put("cleared", null);

      var variablesVisibleAtInput = snapshot(session.engine().getTaskService().getVariables(inputTask.getId()));
      session.engine().getTaskService().complete(inputTask.getId(), submitted);
      var observeTask = requireTask(session.engine(), processInstance.getId(), OBSERVE_TASK);
      var variablesVisibleAtContinuation =
          snapshot(session.engine().getTaskService().getVariables(observeTask.getId()));
      session.engine().getTaskService().complete(observeTask.getId());

      var observation =
          new CompletionObservation(
              variablesVisibleAtInput,
              variablesVisibleAtContinuation,
              historicVariables(session.engine(), processInstance.getId()),
              session
                  .engine()
                  .getRuntimeService()
                  .createProcessInstanceQuery()
                  .processInstanceId(processInstance.getId())
                  .count());
      var expectedPatch = new LinkedHashMap<String, Object>();
      expectedPatch.put("cleared", null);
      expectedPatch.put("created", "yes");
      expectedPatch.put("existing", "after");
      expectedPatch.put("unrelated", "kept");

      assertEquals(initial, observation.variablesVisibleAtInput());
      assertEquals(expectedPatch, observation.variablesVisibleAtContinuation());
      assertEquals(expectedPatch, observation.finalHistoricVariables());
      assertEquals(0, observation.liveProcessCountAfterFinalCompletion());
    }
  }

  @Test
  public void noDataCompletionPreservesTheExistingProcessVariables() {
    try (var session = ProbeSession.open("user-task-no-data-control")) {
      var initial = Map.<String, Object>of(
          "existing", "before",
          "unrelated", "kept");
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
  public void unknownAndStaleTaskIdsApplyNoSubmittedValues() {
    try (var session = ProbeSession.open("user-task-completion-refusal")) {
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
                  .complete("missing-task-id", Map.of("unknown", "must-not-apply")));
      assertEquals(initial, runtimeVariables(session.engine(), processInstance.getId()));
      assertEquals(
          List.of(INPUT_TASK), activeTaskKeys(session.engine(), processInstance.getId()));

      session
          .engine()
          .getTaskService()
          .complete(inputTask.getId(), Map.of("accepted", "yes"));
      var accepted = Map.<String, Object>of("accepted", "yes", "guard", "kept");
      assertEquals(accepted, runtimeVariables(session.engine(), processInstance.getId()));

      assertThrows(
          ProcessEngineException.class,
          () ->
              session
                  .engine()
                  .getTaskService()
                  .complete(inputTask.getId(), Map.of("stale", "must-not-apply")));
      assertEquals(accepted, runtimeVariables(session.engine(), processInstance.getId()));
      assertEquals(
          List.of(OBSERVE_TASK), activeTaskKeys(session.engine(), processInstance.getId()));
    }
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

  private record CompletionObservation(
      Map<String, Object> variablesVisibleAtInput,
      Map<String, Object> variablesVisibleAtContinuation,
      Map<String, Object> finalHistoricVariables,
      long liveProcessCountAfterFinalCompletion) {}

  private record ProbeSession(ProcessEngine engine, String deploymentId)
      implements AutoCloseable {

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
        throw new IllegalStateException("Cannot deploy the completion-data probe", error);
      }
    }

    @Override
    public void close() {
      try {
        engine
            .getRepositoryService()
            .deleteDeployment(deploymentId, true, true, true);
      } finally {
        engine.close();
      }
    }
  }
}
