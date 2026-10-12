package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
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
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.task.Task;
import org.junit.Test;

/** Separates body-local initialization and mapped writes from Process-wide state in repeated scopes. */
public final class CibSevenSequentialMultiInstanceDataProbeTest {
  private static final Path RESOURCE = Path.of(
      "src/test/resources/org/bpmnlean/cibseven/sequential-mi-business-subprocess-probe.bpmn");

  private record Invocation(String process, Object item, Object status) {}

  private enum OutputShape { DISTINCT, SHARED }
  private enum SummaryTarget { ABSENT, PRESENT }

  @Test
  public void distinctResultsReachBodyAndProcessTargets() throws Exception {
    assertRepeatedOutputs(OutputShape.DISTINCT);
  }

  @Test
  public void oneResultFansOutToBodyAndProcessTargets() throws Exception {
    assertRepeatedOutputs(OutputShape.SHARED);
  }

  private static void assertRepeatedOutputs(OutputShape shape) throws Exception {
    for (var target : SummaryTarget.values()) {
      for (boolean firstNull : List.of(false, true)) {
        try (var session = new Session(outputXml(shape, false))) {
          var process = session.start(List.of("a", "b"), target);
          var unrelated = session.start(List.of("x"), target);
          for (int iteration = 0; iteration < 2; iteration++) {
            var item = iteration == 0 ? "a" : "b";
            session.assertFresh(process, item);
            if (iteration == 0) session.assertInitialSummary(process, target);
            var status = (iteration == 0 ? firstNull : !firstNull) ? null : "approved-" + item;
            session.review(process, status);
            var decision = status == null ? null : item + ":" + status;
            var summary = shape == OutputShape.DISTINCT && decision != null ? "audited:" + decision : decision;
            session.assertOutputs(process, decision, summary);
            session.assertFresh(unrelated, "x");
            session.assertInitialSummary(unrelated, target);
            session.complete(process, "Confirm");
            session.assertSummary(process, summary);
          }
          session.finish(process);
          assertEquals(2, session.calls.size());
          session.assertFresh(unrelated, "x");
          session.assertInitialSummary(unrelated, target);
        }
      }
    }
  }

  @Test
  public void crossedSourcesChangePublicBodyAndProcessOutputs() throws Exception {
    try (var session = new Session(outputXml(OutputShape.DISTINCT, true))) {
      var process = session.start(List.of("a", "b"), SummaryTarget.ABSENT);
      session.review(process, "approved-a");
      assertThrows(AssertionError.class,
          () -> session.assertOutputs(process, "a:approved-a", "audited:a:approved-a"));
      session.assertOutputs(process, "audited:a:approved-a", "a:approved-a");
      session.complete(process, "Confirm");
      session.assertFresh(process, "b");
      session.assertSummary(process, "a:approved-a");
    }
  }

  private static String outputXml(OutputShape shape, boolean crossed) throws Exception {
    var output = "<camunda:outputParameter name=\"decision\">${result}</camunda:outputParameter>";
    var outputs = switch (shape) {
      case DISTINCT -> "<camunda:inputParameter name=\"summaryResult\">argument-only</camunda:inputParameter>"
          + "<camunda:outputParameter name=\"decision\">${" + (crossed ? "summaryResult" : "result") + "}</camunda:outputParameter>"
          + "<camunda:outputParameter name=\"summary\">${" + (crossed ? "result" : "summaryResult") + "}</camunda:outputParameter>";
      case SHARED -> output + "<camunda:outputParameter name=\"summary\">${result}</camunda:outputParameter>";
    };
    var xml = Files.readString(RESOURCE);
    assertTrue(xml.contains(output));
    assertEquals(xml.indexOf(output), xml.lastIndexOf(output));
    return xml.replace(output, outputs);
  }

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
        var result = status == null ? null : item + ":" + status;
        execution.setVariableLocal("result", result);
        if (execution.hasVariableLocal("summaryResult")) {
          assertEquals("argument-only", execution.getVariableLocal("summaryResult"));
          execution.setVariableLocal("summaryResult", result == null ? null : "audited:" + result);
        }
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
      return start(items, SummaryTarget.ABSENT);
    }

    String start(List<String> items, SummaryTarget target) {
      var variables = new HashMap<String, Object>(Map.of("items", items, "item", "parent-item",
          "reviewStatus", "parent-status", "decision", "parent-decision", "result", "parent-result",
          "summaryResult", "parent-summary-result"));
      if (target == SummaryTarget.PRESENT) variables.put("summary", "parent-summary");
      return engine.getRuntimeService().startProcessInstanceByKey("InvoiceDataBatch", variables).getId();
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

    void assertOutputs(String process, String decision, String summary) {
      assertDecision(process, decision);
      var bindings = engine.getRuntimeService().createVariableInstanceQuery()
          .processInstanceIdIn(process).variableName("decision").list();
      assertEquals(2, bindings.size());
      var bodyBindings = bindings.stream().filter(value -> !process.equals(value.getExecutionId())).toList();
      assertEquals(1, bodyBindings.size());
      assertEquals(decision, bodyBindings.getFirst().getValue());
      assertSummary(process, summary);
      var visible = engine.getTaskService().getVariables(task(process, "Confirm").getId());
      assertTrue(visible.containsKey("decision"));
      assertTrue(visible.containsKey("summary"));
      assertEquals(summary, visible.get("summary"));
      for (var name : List.of("payload", "status")) {
        assertEquals(0, engine.getRuntimeService().createVariableInstanceQuery()
            .processInstanceIdIn(process).variableName(name).count());
      }
      assertEquals(1, engine.getRuntimeService().createVariableInstanceQuery()
          .processInstanceIdIn(process).variableName("summaryResult").count());
    }

    void assertSummary(String process, String summary) {
      var local = engine.getRuntimeService().getVariablesLocal(process);
      assertTrue(local.containsKey("summary"));
      assertEquals(summary, local.get("summary"));
      var bindings = engine.getRuntimeService().createVariableInstanceQuery()
          .processInstanceIdIn(process).variableName("summary").list();
      assertEquals(1, bindings.size());
      assertEquals(process, bindings.getFirst().getExecutionId());
      assertEquals(summary, bindings.getFirst().getValue());
    }

    void assertInitialSummary(String process, SummaryTarget target) {
      switch (target) {
        case PRESENT -> assertSummary(process, "parent-summary");
        case ABSENT -> {
          assertFalse(engine.getRuntimeService().getVariablesLocal(process).containsKey("summary"));
          assertEquals(0, engine.getRuntimeService().createVariableInstanceQuery()
              .processInstanceIdIn(process).variableName("summary").count());
        }
      }
    }

    void assertParent(String process) {
      var values = engine.getRuntimeService().getVariables(process);
      assertEquals("parent-item", values.get("item"));
      assertEquals("parent-status", values.get("reviewStatus"));
      assertEquals("parent-decision", values.get("decision"));
      assertEquals("parent-result", values.get("result"));
      assertEquals("parent-summary-result", values.get("summaryResult"));
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
