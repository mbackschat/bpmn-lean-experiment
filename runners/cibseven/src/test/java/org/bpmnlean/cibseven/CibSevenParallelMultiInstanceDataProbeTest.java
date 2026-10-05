package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.ProcessEngineException;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.task.Task;
import org.junit.Test;

/** Public-service discriminators for the parallel MI Sub-Process proposal's data context. */
public final class CibSevenParallelMultiInstanceDataProbeTest {
  private record Invocation(Object item, Object status) {}

  @Test
  public void concurrentBodiesCaptureInputsAndKeepNullAndMappedResultsLocal() throws Exception {
    try (var s = new Session(true, false)) {
      var process = s.start(false);
      var a = s.task(process, "a", "Review");
      var b = s.task(process, "b", "Review");
      assertNotEquals(a.getId(), b.getId());
      for (var task : List.of(a, b)) assertEquals("parent-status", s.value(task, "initialParent"));
      s.engine.getRuntimeService().setVariable(process, "reviewStatus", "changed-parent");
      s.review(b, null, null);
      var confirmB = s.task(process, "b", "Confirm");
      assertNull(s.value(confirmB, "decision"));
      assertTrue(s.engine.getTaskService().getVariables(confirmB.getId()).containsKey("decision"));
      assertEquals("pending", s.value(a, "reviewStatus"));
      assertEquals("unset", s.value(a, "decision"));
      assertEquals("parent-status", s.value(a, "initialParent"));
      s.complete(confirmB);
      assertEquals(1, s.tasks(process).size());
      s.review(a, "approved-a", null);
      assertEquals("a:approved-a", s.value(s.task(process, "a", "Confirm"), "decision"));
      s.complete(s.task(process, "a", "Confirm"));
      assertEquals(List.of(new Invocation("b", null), new Invocation("a", "approved-a")), s.calls);
      assertEquals("changed-parent", s.parent(process, "reviewStatus"));
      assertEquals("parent-decision", s.parent(process, "decision"));
      assertEquals("parent-item", s.parent(process, "item"));
      assertFalse(s.engine.getRuntimeService().getVariables(process).containsKey("initialParent"));
      s.finish(process);
    }
  }

  @Test
  public void undeclaredBodyBindingsShareEnclosingWritesInCommandOrder() throws Exception {
    try (var s = new Session(false, false)) {
      var process = s.start(false);
      var a = s.task(process, "a", "Review");
      s.review(s.task(process, "b", "Review"), "accepted-b", null);
      assertEquals("accepted-b", s.value(a, "reviewStatus"));
      assertEquals("b:accepted-b", s.value(a, "decision"));
      s.review(a, "accepted-a", null);
      assertEquals("accepted-a", s.value(s.task(process, "b", "Confirm"), "reviewStatus"));
      assertEquals("a:accepted-a", s.parent(process, "decision"));
      s.complete(s.task(process, "a", "Confirm"));
      s.complete(s.task(process, "b", "Confirm"));
      s.finish(process);
    }
  }

  @Test
  public void processConditionWaitsForBodyCompletionThenCancelsSibling() throws Exception {
    try (var s = new Session(true, false)) {
      var process = s.start(false);
      var stale = s.task(process, "a", "Review");
      s.review(s.task(process, "b", "Review"), "rejected", true);
      assertEquals(2, s.tasks(process).size());
      assertEquals(true, s.parent(process, "stop"));
      s.complete(s.task(process, "b", "Confirm"));
      assertNull(s.engine.getTaskService().createTaskQuery().taskId(stale.getId()).singleResult());
      assertThrows(ProcessEngineException.class, () -> s.complete(stale));
      assertEquals(List.of(new Invocation("b", "rejected")), s.calls);
      s.finish(process);
    }
  }

  @Test
  public void completionConditionUsesEnclosingContextAfterBodyLocalsAreDisposed() throws Exception {
    for (boolean parentStop : List.of(false, true)) {
      try (var s = new Session(true, true)) {
        var process = s.start(parentStop);
        s.review(s.task(process, "b", "Review"), "reviewed", !parentStop);
        assertEquals(parentStop, s.parent(process, "stop"));
        assertEquals(!parentStop, s.value(s.task(process, "b", "Confirm"), "stop"));
        s.complete(s.task(process, "b", "Confirm"));
        if (parentStop) s.finish(process);
        else {
          assertNotNull(s.task(process, "a", "Review"));
          assertEquals(1, s.tasks(process).size());
          s.review(s.task(process, "a", "Review"), "reviewed", false);
          s.complete(s.task(process, "a", "Confirm"));
          s.finish(process);
        }
      }
    }
  }

  private static final class Session implements AutoCloseable {
    final List<Invocation> calls = new ArrayList<>();
    final ProcessEngine engine;
    final String deployment;

    Session(boolean locals, boolean localCondition) throws Exception {
      var xml = Files.readString(Path.of("src/test/resources/org/bpmnlean/cibseven/sequential-mi-business-subprocess-probe.bpmn"));
      assertTrue(xml.contains("isSequential=\"true\""));
      xml = xml.replace("isSequential=\"true\"", "isSequential=\"false\"")
          .replace("camunda:elementVariable=\"item\" />", "camunda:elementVariable=\"item\">"
              + "<completionCondition>${stop}</completionCondition></multiInstanceLoopCharacteristics>");
      if (!locals) {
        xml = xml.replace("<camunda:inputParameter name=\"reviewStatus\">pending</camunda:inputParameter>", "")
            .replace("<camunda:inputParameter name=\"decision\">unset</camunda:inputParameter>", "");
      }
      xml = xml.replaceFirst("<camunda:inputOutput>", "<camunda:inputOutput>"
          + java.util.regex.Matcher.quoteReplacement("<camunda:inputParameter name=\"initialParent\">${reviewStatus}</camunda:inputParameter>"
              + (localCondition ? "<camunda:inputParameter name=\"stop\">${false}</camunda:inputParameter>" : "")));
      JavaDelegate validator = execution -> {
        var item = execution.getVariableLocal("payload");
        var status = execution.getVariableLocal("status");
        calls.add(new Invocation(item, status));
        execution.setVariableLocal("result", status == null ? null : item + ":" + status);
      };
      engine = CibSevenTestEngine.create("parallel-mi-data", c -> c.setBeans(Map.of("invoiceValidator", validator)));
      try {
        deployment = engine.getRepositoryService().createDeployment().addString("parallel-mi-data.bpmn", xml).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(boolean stop) {
      return engine.getRuntimeService().startProcessInstanceByKey("InvoiceDataBatch", Map.of(
          "items", List.of("a", "b"), "item", "parent-item", "reviewStatus", "parent-status",
          "decision", "parent-decision", "result", "parent-result", "stop", stop)).getId();
    }

    List<Task> tasks(String process) { return engine.getTaskService().createTaskQuery().processInstanceId(process).list(); }
    Object value(Task task, String name) { return engine.getTaskService().getVariable(task.getId(), name); }
    Object parent(String process, String name) { return engine.getRuntimeService().getVariable(process, name); }
    Task task(String process, String item, String key) {
      var matches = tasks(process).stream().filter(t -> key.equals(t.getTaskDefinitionKey()) && item.equals(value(t, "item"))).toList();
      assertEquals(1, matches.size());
      return matches.getFirst();
    }
    void review(Task task, String status, Boolean stop) {
      var patch = new HashMap<String, Object>();
      patch.put("reviewStatus", status);
      if (stop != null) patch.put("stop", stop);
      engine.getTaskService().complete(task.getId(), patch);
    }
    void complete(Task task) { engine.getTaskService().complete(task.getId()); }
    void finish(String process) {
      var tasks = tasks(process);
      assertEquals(1, tasks.size());
      assertEquals("PublishBatch", tasks.getFirst().getTaskDefinitionKey());
      complete(tasks.getFirst());
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(process).count());
    }
    @Override public void close() {
      try { engine.getRepositoryService().deleteDeployment(deployment, true, true, true); }
      finally { engine.close(); }
    }
  }
}
