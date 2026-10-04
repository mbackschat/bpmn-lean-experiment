package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.task.Task;
import org.junit.Test;

/** Separates body-local initialization and mapped writes from Process-wide state in repeated scopes. */
public final class CibSevenSequentialMultiInstanceDataProbeTest {
  private static final Path RESOURCE = Path.of(
      "src/test/resources/org/bpmnlean/cibseven/sequential-mi-business-subprocess-probe.bpmn");

  private record Invocation(String process, Object item, Object status) {}

  @Test
  public void repeatedBodiesAndInterleavedProcessesKeepTheirOwnHumanAndServiceData() throws Exception {
    try (var session = new Session(Files.readString(RESOURCE))) {
      var first = session.start(List.of("a", "b"));
      var second = session.start(List.of("x"));
      session.assertFresh(first, "a");
      session.assertFresh(second, "x");
      session.review(second, "approved-x");
      session.assertDecision(second, "x:approved-x");
      session.assertFresh(first, "a");
      session.complete(second, "Confirm");
      session.finish(second);

      session.review(first, "approved-a");
      session.assertDecision(first, "a:approved-a");
      session.complete(first, "Confirm");
      session.assertFresh(first, "b");
      session.review(first, "approved-b");
      session.assertDecision(first, "b:approved-b");
      session.complete(first, "Confirm");
      session.finish(first);
      assertEquals(List.of(new Invocation(second, "x", "approved-x"),
          new Invocation(first, "a", "approved-a"),
          new Invocation(first, "b", "approved-b")), session.calls);
    }
  }

  @Test
  public void presentNullShadowsTheParentAndIsDiscardedBeforeTheNextBody() throws Exception {
    try (var session = new Session(Files.readString(RESOURCE))) {
      var process = session.start(List.of("a", "b"));
      session.review(process, null);
      session.assertDecision(process, null);
      var task = session.task(process, "Confirm");
      assertTrue(session.engine.getTaskService().getVariables(task.getId()).containsKey("decision"));
      assertNull(session.engine.getTaskService().getVariable(task.getId(), "reviewStatus"));
      assertEquals(List.of(new Invocation(process, "a", null)), session.calls);
      session.complete(process, "Confirm");
      session.assertFresh(process, "b");
    }
  }

  @Test
  public void absentBodyDeclarationsWriteTheExistingParentBindingsInstead() throws Exception {
    var xml = Files.readString(RESOURCE);
    for (var declaration : List.of(
        "<camunda:inputParameter name=\"reviewStatus\">pending</camunda:inputParameter>",
        "<camunda:inputParameter name=\"decision\">unset</camunda:inputParameter>")) {
      assertTrue(xml.contains(declaration));
      xml = xml.replace(declaration, "");
    }
    try (var session = new Session(xml)) {
      var process = session.start(List.of("a", "b"));
      session.review(process, "approved");
      assertEquals("approved", session.engine.getRuntimeService().getVariable(process, "reviewStatus"));
      assertEquals("a:approved", session.engine.getRuntimeService().getVariable(process, "decision"));
      session.complete(process, "Confirm");
      var next = session.task(process, "Review");
      assertEquals("a:approved", session.engine.getTaskService().getVariable(next.getId(), "decision"));
    }
  }

  private static final class Session implements AutoCloseable {
    final List<Invocation> calls = new ArrayList<>();
    final ProcessEngine engine;
    final String deployment;

    Session(String xml) {
      JavaDelegate validator = execution -> {
        assertTrue(execution.hasVariableLocal("payload"));
        assertTrue(execution.hasVariableLocal("status"));
        var item = execution.getVariableLocal("payload");
        var status = execution.getVariableLocal("status");
        calls.add(new Invocation(execution.getProcessInstanceId(), item, status));
        execution.setVariableLocal("result", status == null ? null : item + ":" + status);
      };
      engine = CibSevenTestEngine.create("mi-subprocess-data",
          configuration -> configuration.setBeans(Map.of("invoiceValidator", validator)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("mi-subprocess-data.bpmn", xml).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(List<String> items) {
      return engine.getRuntimeService().startProcessInstanceByKey("InvoiceDataBatch",
          Map.of("items", items, "item", "parent-item", "reviewStatus", "parent-status",
              "decision", "parent-decision", "result", "parent-result")).getId();
    }

    Task task(String process, String key) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(process)
          .taskDefinitionKey(key).singleResult();
      assertNotNull(task);
      return task;
    }

    void review(String process, String status) {
      var patch = new HashMap<String, Object>();
      patch.put("reviewStatus", status);
      engine.getTaskService().complete(task(process, "Review").getId(), patch);
    }

    void complete(String process, String key) {
      engine.getTaskService().complete(task(process, key).getId());
    }

    void assertFresh(String process, String item) {
      var values = engine.getTaskService().getVariables(task(process, "Review").getId());
      assertEquals(item, values.get("item"));
      assertEquals("pending", values.get("reviewStatus"));
      assertEquals("unset", values.get("decision"));
      assertParent(process);
    }

    void assertDecision(String process, String decision) {
      assertEquals(decision, engine.getTaskService().getVariable(task(process, "Confirm").getId(), "decision"));
      assertParent(process);
    }

    void assertParent(String process) {
      var values = engine.getRuntimeService().getVariables(process);
      assertEquals("parent-item", values.get("item"));
      assertEquals("parent-status", values.get("reviewStatus"));
      assertEquals("parent-decision", values.get("decision"));
      assertEquals("parent-result", values.get("result"));
      assertFalse(values.containsKey("payload"));
      assertFalse(values.containsKey("status"));
    }

    void finish(String process) {
      task(process, "PublishBatch");
      assertParent(process);
      complete(process, "PublishBatch");
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(process).count());
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
