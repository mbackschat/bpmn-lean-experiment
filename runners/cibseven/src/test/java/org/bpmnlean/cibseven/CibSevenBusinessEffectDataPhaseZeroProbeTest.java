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
import java.util.concurrent.atomic.AtomicReference;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.junit.Test;

/** Separates CIB outer-scope input lookup from local input chaining before the mixed-task account is selected. */
public final class CibSevenBusinessEffectDataPhaseZeroProbeTest {
  private static final String PROCESS = "Process_InvoiceValidation";
  private static final Path RESOURCE = Path.of(
      "src/test/resources/org/bpmnlean/cibseven/business-effect-data.bpmn");

  private record Invocation(String instance, Object payload, Object echo) {}

  @Test
  public void readsEveryInputFromTheOuterScopeInBothDeclarationOrders() throws Exception {
    verifyHandoff(false, "reviewed-invoice", "process-payload");
    verifyHandoff(true, "reviewed-invoice", "process-payload");
  }

  @Test
  public void preservesPresentNullThroughInputAndOutput() throws Exception {
    verifyHandoff(false, null, "process-payload");
  }

  @Test
  public void missingInputFailsBeforeHandlerAndRetainsTheJob() throws Exception {
    var calls = new ArrayList<Invocation>();
    try (var fixture = new Fixture(Files.readString(RESOURCE), calls)) {
      var engine = fixture.engine;
      String instance = engine.getRuntimeService().startProcessInstanceByKey(
          PROCESS, Map.of("payload", "process-payload")).getId();
      engine.getTaskService().complete(taskId(engine, instance, "Review"));
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      var failure = assertThrows(RuntimeException.class, () -> engine.getManagementService().executeJob(job.getId()));
      assertTrue(failure.getMessage().contains("request"));
      assertTrue(calls.isEmpty());
      assertEquals(0, engine.getTaskService().createTaskQuery().processInstanceId(instance).count());
      assertFalse(engine.getRuntimeService().getVariables(instance).containsKey("decision"));
      assertEquals("process-payload", engine.getRuntimeService().getVariable(instance, "payload"));
      assertEquals(2, engine.getManagementService().createJobQuery().jobId(job.getId()).singleResult().getRetries());
    }
  }

  @Test
  public void separatelyStartedInstancesKeepTheirOwnInputsAndResults() throws Exception {
    var calls = new ArrayList<Invocation>();
    try (var fixture = new Fixture(Files.readString(RESOURCE), calls)) {
      var engine = fixture.engine;
      String first = startReviewed(engine, "first");
      String second = startReviewed(engine, "second");
      executeJob(engine, second);
      executeJob(engine, first);
      assertEquals(List.of(
          new Invocation(second, "second", "process-payload"),
          new Invocation(first, "first", "process-payload")), calls);
      assertEquals("first", engine.getRuntimeService().getVariable(first, "decision"));
      assertEquals("second", engine.getRuntimeService().getVariable(second, "decision"));
      assertNotNull(taskId(engine, first, "Finalize"));
      assertNotNull(taskId(engine, second, "Finalize"));
    }
  }

  private static void verifyHandoff(boolean reversed, String value, Object expectedEcho) throws Exception {
    String xml = Files.readString(RESOURCE);
    if (reversed) {
      String inputs = "<camunda:inputParameter name=\"payload\">${request}</camunda:inputParameter>\n"
          + "          <camunda:inputParameter name=\"echo\">${payload}</camunda:inputParameter>";
      assertTrue(xml.contains(inputs));
      xml = xml.replace(inputs,
          "<camunda:inputParameter name=\"echo\">${payload}</camunda:inputParameter>\n"
              + "          <camunda:inputParameter name=\"payload\">${request}</camunda:inputParameter>");
    }
    var calls = new ArrayList<Invocation>();
    try (var fixture = new Fixture(xml, calls)) {
      var engine = fixture.engine;
      String instance = startReviewed(engine, value);
      assertTrue(calls.isEmpty());
      assertFalse(engine.getRuntimeService().getVariables(instance).containsKey("decision"));
      executeJob(engine, instance);
      assertEquals(List.of(new Invocation(instance, value, expectedEcho)), calls);
      assertTrue(engine.getRuntimeService().getVariables(instance).containsKey("decision"));
      assertEquals(value, engine.getRuntimeService().getVariable(instance, "decision"));
      assertEquals("process-payload", engine.getRuntimeService().getVariable(instance, "payload"));
      assertEquals("parent-result", engine.getRuntimeService().getVariable(instance, "result"));
      assertFalse(engine.getRuntimeService().getVariables(instance).containsKey("echo"));
      engine.getTaskService().complete(taskId(engine, instance, "Finalize"));
      assertNull(engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(instance).singleResult());
    }
  }

  private static String startReviewed(ProcessEngine engine, String value) {
    String instance = engine.getRuntimeService().startProcessInstanceByKey(PROCESS,
        Map.of("request", "unreviewed-invoice", "payload", "process-payload", "result", "parent-result")).getId();
    var patch = new HashMap<String, Object>();
    patch.put("request", value);
    engine.getTaskService().complete(taskId(engine, instance, "Review"), patch);
    return instance;
  }

  private static String taskId(ProcessEngine engine, String instance, String element) {
    var task = engine.getTaskService().createTaskQuery().processInstanceId(instance)
        .taskDefinitionKey(element).singleResult();
    assertNotNull(task);
    return task.getId();
  }

  private static void executeJob(ProcessEngine engine, String instance) {
    var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
    assertNotNull(job);
    engine.getManagementService().executeJob(job.getId());
  }

  private static final class Fixture implements AutoCloseable {
    private final ProcessEngine engine;
    private final String deployment;

    private Fixture(String xml, List<Invocation> calls) {
      var parse = new AtomicReference<BpmnParse>();
      JavaDelegate handler = execution -> {
        assertTrue(execution.hasVariableLocal("payload"));
        assertTrue(execution.hasVariableLocal("echo"));
        Object payload = execution.getVariableLocal("payload");
        calls.add(new Invocation(execution.getProcessInstanceId(), payload,
            execution.getVariableLocal("echo")));
        execution.setVariableLocal("result", payload);
      };
      engine = CibSevenTestEngine.create("business-effect-data", configuration -> {
        configuration.setBeans(Map.of("invoiceValidator", handler));
        configuration.setBpmnParseFactory(parser -> {
          var current = new BpmnParse(parser);
          parse.set(current);
          return current;
        });
      });
      String created = null;
      try {
        created = engine.getRepositoryService().createDeployment()
            .addString("business-effect-data.bpmn", xml).deploy().getId();
        assertNotNull(parse.get());
        assertFalse(parse.get().hasWarnings());
        deployment = created;
      } catch (RuntimeException | Error failure) {
        if (created != null) engine.getRepositoryService().deleteDeployment(created, true);
        engine.close();
        throw failure;
      }
    }

    @Override
    public void close() {
      try {
        engine.getRepositoryService().deleteDeployment(deployment, true);
      } finally {
        engine.close();
      }
    }
  }
}
