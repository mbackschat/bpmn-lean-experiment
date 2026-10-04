package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.task.Task;
import org.junit.Test;

/** Calibrates body completion and collection lookup through CIB Seven 2.2 public services. */
public final class CibSevenSequentialMultiInstanceSubprocessProbeTest {
  private static final String RESOURCE =
      "org/bpmnlean/cibseven/sequential-mi-subprocess-probe.bpmn";

  @Test
  public void commercialCompletionWaitsForComplianceBeforeLookingUpNextItem() {
    assertTurnover("Commercial", "Compliance");
  }

  @Test
  public void complianceCompletionWaitsForCommercialBeforeLookingUpNextItem() {
    assertTurnover("Compliance", "Commercial");
  }

  @Test
  public void shortenedCollectionRollsBackBodyCompletionWithoutLosingTheRemainingTask() {
    try (var session = Session.open("mi-subprocess-shrink")) {
      var process = session.start(List.of("a", "b"));
      session.complete(session.task(process, "Commercial"));
      var remaining = session.task(process, "Compliance");
      session.engine().getRuntimeService().setVariable(process, "items", List.of("a"));

      assertThrows(NoSuchElementException.class, () -> session.complete(remaining));

      assertEquals(List.of("Compliance"), session.taskKeys(process));
      assertEquals(remaining.getId(), session.task(process, "Compliance").getId());
      session.assertLoop(remaining, "a", 0, 0);
      session.engine().getRuntimeService().setVariable(process, "items", List.of("a", "c", "d"));
      session.complete(remaining);
      session.assertBody(process, "c", 1, 1);
      session.complete(session.task(process, "Commercial"));
      session.complete(session.task(process, "Compliance"));
      session.finish(process, 2);
    }
  }

  @Test
  public void completionConditionIsAppliedAfterTheWholeBodyCompletes() {
    try (var session = Session.open("mi-subprocess-early")) {
      var process = session.start(List.of("a", "b"));
      session.engine().getRuntimeService().setVariable(process, "stop", true);
      session.complete(session.task(process, "Commercial"));
      assertEquals(List.of("Compliance"), session.taskKeys(process));
      session.assertLoop(session.task(process, "Compliance"), "a", 0, 0);
      session.complete(session.task(process, "Compliance"));
      session.finish(process, 1);
    }
  }

  @Test
  public void emptyCollectionCreatesNoBodyAndContinuesTheParent() {
    try (var session = Session.open("mi-subprocess-empty")) {
      session.finish(session.start(List.of()), 0);
    }
  }

  private static void assertTurnover(String first, String last) {
    try (var session = Session.open("mi-subprocess-" + first)) {
      var process = session.start(List.of("a", "b"));
      session.assertBody(process, "a", 0, 0);
      var oldFirst = session.task(process, first);
      var oldLast = session.task(process, last);
      session.engine().getRuntimeService().setVariable(process, "items", List.of("a", "c", "d"));
      session.complete(oldFirst);
      assertEquals(List.of(last), session.taskKeys(process));
      assertEquals(oldLast.getId(), session.task(process, last).getId());
      session.assertLoop(oldLast, "a", 0, 0);
      session.complete(oldLast);

      session.assertBody(process, "c", 1, 1);
      assertNotEquals(oldFirst.getId(), session.task(process, first).getId());
      assertNotEquals(oldLast.getId(), session.task(process, last).getId());
      assertThrows(ProcessEngineException.class, () -> session.complete(oldLast));
      session.assertBody(process, "c", 1, 1);
      session.complete(session.task(process, first));
      session.complete(session.task(process, last));
      session.finish(process, 2);
    }
  }

  private record Session(ProcessEngine engine, String deployment) implements AutoCloseable {
    static Session open(String name) {
      var engine = CibSevenTestEngine.create(name);
      try {
        var deployment = engine.getRepositoryService().createDeployment()
            .addClasspathResource(RESOURCE).deploy();
        return new Session(engine, deployment.getId());
      } catch (RuntimeException error) {
        engine.close();
        throw error;
      }
    }

    String start(List<String> items) {
      return engine.getRuntimeService().startProcessInstanceByKey(
          "InvoiceBatch", Map.of("items", items, "stop", false)).getId();
    }

    Task task(String process, String key) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(process)
          .taskDefinitionKey(key).singleResult();
      assertNotNull(task);
      return task;
    }

    List<String> taskKeys(String process) {
      return engine.getTaskService().createTaskQuery().processInstanceId(process).list()
          .stream().map(Task::getTaskDefinitionKey).sorted().toList();
    }

    void complete(Task task) {
      engine.getTaskService().complete(task.getId());
    }

    void assertBody(String process, String item, int index, int completed) {
      assertEquals(List.of("Commercial", "Compliance"), taskKeys(process));
      assertLoop(task(process, "Commercial"), item, index, completed);
      assertLoop(task(process, "Compliance"), item, index, completed);
    }

    void assertLoop(Task task, String item, int index, int completed) {
      var variables = engine.getTaskService().getVariables(task.getId());
      assertEquals(item, variables.get("item"));
      assertEquals(index, variables.get("loopCounter"));
      assertEquals(2, variables.get("nrOfInstances"));
      assertEquals(1, variables.get("nrOfActiveInstances"));
      assertEquals(completed, variables.get("nrOfCompletedInstances"));
    }

    void finish(String process, long bodies) {
      assertEquals(List.of("PublishBatch"), taskKeys(process));
      assertEquals(bodies, engine.getHistoryService().createHistoricActivityInstanceQuery()
          .processInstanceId(process).activityId("ReviewInvoice").finished().count());
      complete(task(process, "PublishBatch"));
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery()
          .processInstanceId(process).count());
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
