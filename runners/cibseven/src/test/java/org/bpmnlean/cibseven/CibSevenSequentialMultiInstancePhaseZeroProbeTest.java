package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.runtime.Job;
import org.cibseven.bpm.engine.task.Task;
import org.junit.Test;

/**
 * Calibrates CIB Seven 2.2 public-service behavior for one exact collection-driven sequential
 * Multi-Instance User Task before the project selects a compatibility relationship.
 */
public final class CibSevenSequentialMultiInstancePhaseZeroProbeTest {

  private static final String RESOURCE =
      "org/bpmnlean/cibseven/CibSevenSequentialMultiInstancePhaseZeroProbeTest.bpmn";
  private static final String PROCESS_ID = "Process_SequentialMultiInstanceProbe";
  private static final String REVIEW_TASK = "UserTask_Review";
  private static final String ESCALATION_TASK = "UserTask_Escalation";
  private static final String INPUT_COLLECTION = "DataInput_Items";
  private static final String CURRENT_ITEM = "currentItem";
  private static final String CURRENT_RESULT = "reviewResult";
  private static final String OUTPUT_COLLECTION = "DataOutput_Results";
  private static final String NUMBER_OF_INSTANCES = "nrOfInstances";
  private static final String NUMBER_OF_ACTIVE_INSTANCES = "nrOfActiveInstances";
  private static final String NUMBER_OF_COMPLETED_INSTANCES = "nrOfCompletedInstances";
  private static final String LOOP_COUNTER = "loopCounter";

  @Test
  public void exposesDesiredCardinalityAtEverySequentialWait() {
    try (var session = ProbeSession.open("sequential-mi-desired-cardinality")) {
      var processInstanceId = session.start(List.of("alpha", "beta", "gamma"));

      for (int index = 0; index < 3; index++) {
        var task = requireTask(session.engine(), processInstanceId, REVIEW_TASK);

        assertLoopVariable(session.engine(), task.getId(), NUMBER_OF_INSTANCES, 3);
        assertLoopVariable(session.engine(), task.getId(), NUMBER_OF_ACTIVE_INSTANCES, 1);
        assertLoopVariable(session.engine(), task.getId(), NUMBER_OF_COMPLETED_INSTANCES, index);
        assertLoopVariable(session.engine(), task.getId(), LOOP_COUNTER, index);
        session.engine().getTaskService().complete(task.getId());
      }
    }
  }

  @Test
  public void doesNotAggregateTheStandardOutputCollection() {
    try (var session = ProbeSession.open("sequential-mi-output")) {
      var processInstanceId = session.start(List.of("alpha", "beta", "gamma"));
      var expected = List.of("approved-alpha", "approved-beta", "approved-gamma");

      for (var result : expected) {
        var task = requireTask(session.engine(), processInstanceId, REVIEW_TASK);
        session.engine().getTaskService().setVariableLocal(task.getId(), CURRENT_RESULT, result);
        session.engine().getTaskService().complete(task.getId());
      }

      for (var candidate : outputCollectionCandidates()) {
        assertNull(historicVariable(session.engine(), processInstanceId, candidate));
      }
    }
  }

  @Test
  public void turnsOverTasksInCollectionOrderAndKeepsOneOuterTimer() {
    try (var session = ProbeSession.open("sequential-mi-order")) {
      var processInstanceId = session.start(List.of("alpha", "beta", "gamma"));
      var taskIds = new ArrayList<String>();
      var items = new ArrayList<String>();
      TimerIdentity timer = null;

      for (int index = 0; index < 3; index++) {
        var task = requireTask(session.engine(), processInstanceId, REVIEW_TASK);
        taskIds.add(task.getId());
        items.add((String) session.engine().getTaskService().getVariable(task.getId(), CURRENT_ITEM));

        var currentTimer = timerIdentity(requireTimer(session.engine(), processInstanceId));
        if (timer == null) {
          timer = currentTimer;
        } else {
          assertEquals(timer, currentTimer);
        }
        session.engine().getTaskService().complete(task.getId());
      }

      assertEquals(List.of("alpha", "beta", "gamma"), items);
      assertEquals(3, taskIds.stream().distinct().count());
      assertEquals(0, liveProcessCount(session.engine(), processInstanceId));
      assertEquals(0, timerCount(session.engine(), processInstanceId));
    }
  }

  @Test
  public void zeroCollectionCompletesWithoutTaskTimerOrOutput() {
    try (var session = ProbeSession.open("sequential-mi-zero")) {
      var processInstanceId = session.start(List.of());

      assertEquals(0, liveProcessCount(session.engine(), processInstanceId));
      assertEquals(0, taskCount(session.engine(), processInstanceId));
      assertEquals(0, timerCount(session.engine(), processInstanceId));
      for (var candidate : outputCollectionCandidates()) {
        assertNull(historicVariable(session.engine(), processInstanceId, candidate));
      }
    }
  }

  @Test
  public void boundaryTimerInterruptsTheOuterActivityAndMakesTheCurrentTaskStale() {
    try (var session = ProbeSession.open("sequential-mi-boundary")) {
      var processInstanceId = session.start(List.of("alpha", "beta", "gamma"));
      var firstTask = requireTask(session.engine(), processInstanceId, REVIEW_TASK);
      session.engine().getTaskService().complete(firstTask.getId());
      var secondTask = requireTask(session.engine(), processInstanceId, REVIEW_TASK);
      var timer = requireTimer(session.engine(), processInstanceId);

      session.engine().getManagementService().executeJob(timer.getId());

      assertEquals(List.of(ESCALATION_TASK), activeTaskKeys(session.engine(), processInstanceId));
      assertEquals(0, timerCount(session.engine(), processInstanceId));
      assertThrows(
          ProcessEngineException.class,
          () -> session.engine().getTaskService().complete(secondTask.getId()));
      for (var candidate : outputCollectionCandidates()) {
        assertNull(historicVariable(session.engine(), processInstanceId, candidate));
      }

      var escalation = requireTask(session.engine(), processInstanceId, ESCALATION_TASK);
      session.engine().getTaskService().complete(escalation.getId());
      assertEquals(0, liveProcessCount(session.engine(), processInstanceId));
    }
  }

  private static void assertLoopVariable(
      ProcessEngine engine, String taskId, String name, int expected) {
    assertEquals(
        Integer.valueOf(expected),
        engine.getTaskService().getVariable(taskId, name));
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

  private static Job requireTimer(ProcessEngine engine, String processInstanceId) {
    var timer =
        engine
            .getManagementService()
            .createJobQuery()
            .processInstanceId(processInstanceId)
            .singleResult();
    assertNotNull(timer);
    return timer;
  }

  private static TimerIdentity timerIdentity(Job job) {
    return new TimerIdentity(job.getId(), new Date(job.getDuedate().getTime()));
  }

  private static long liveProcessCount(ProcessEngine engine, String processInstanceId) {
    return engine
        .getRuntimeService()
        .createProcessInstanceQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static long taskCount(ProcessEngine engine, String processInstanceId) {
    return engine
        .getTaskService()
        .createTaskQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static long timerCount(ProcessEngine engine, String processInstanceId) {
    return engine
        .getManagementService()
        .createJobQuery()
        .processInstanceId(processInstanceId)
        .count();
  }

  private static List<String> activeTaskKeys(
      ProcessEngine engine, String processInstanceId) {
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

  private static List<String> outputCollectionCandidates() {
    return List.of(
        OUTPUT_COLLECTION,
        "results",
        "reviewResults",
        "DataObject_Output",
        "DataObjectReference_Output");
  }

  private static Object historicVariable(
      ProcessEngine engine, String processInstanceId, String name) {
    var variable =
        engine
            .getHistoryService()
            .createHistoricVariableInstanceQuery()
            .processInstanceId(processInstanceId)
            .variableName(name)
            .singleResult();
    return variable == null ? null : variable.getValue();
  }

  private record TimerIdentity(String jobId, Date dueDate) {}

  private record ProbeSession(ProcessEngine engine, String deploymentId)
      implements AutoCloseable {

    private static ProbeSession open(String name) {
      var engine = CibSevenTestEngine.create(name);
      try {
        var deployment =
            engine
                .getRepositoryService()
                .createDeployment()
                .addClasspathResource(RESOURCE)
                .deploy();
        return new ProbeSession(engine, deployment.getId());
      } catch (Exception error) {
        engine.close();
        throw new IllegalStateException("Cannot deploy the sequential Multi-Instance probe", error);
      }
    }

    private String start(List<String> items) {
      return engine
          .getRuntimeService()
          .startProcessInstanceByKey(PROCESS_ID, Map.of(INPUT_COLLECTION, items))
          .getId();
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
