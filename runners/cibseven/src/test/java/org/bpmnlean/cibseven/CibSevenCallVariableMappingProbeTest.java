package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.junit.Test;

/**
 * Calibrates `CIB-EXT-0021` on the retained loan application: the caller's Process variables at the points the
 * Call variable mapping scenarios observe, and the child instance's own variables through CIB's query API for
 * `CVM-IN-01`. No CIB child-instance or task id is mapped to the project's derived called identity.
 */
public final class CibSevenCallVariableMappingProbeTest {
  private static final Path PROJECT_ROOT = Path.of("../..").toAbsolutePath().normalize();
  private static final Path MODEL = PROJECT_ROOT.resolve("scenarios/call-variable-mapping/loan-application.bpmn");

  @Test
  public void inputsAreCopiedCalledWritesStayIsolatedAndOutputsLandAtTheCaller() throws Exception {
    try (var session = new Session()) {
      var loan = session.start(Map.of("amount", "25000", "applicant", "Ada"));
      session.acknowledge(loan);
      var called = session.called(loan);
      assertEquals(Map.of("amount", "25000", "customer", "Ada"), session.engine.getRuntimeService().getVariablesLocal(called));
      session.complete(called, "CollectDocument", Map.of("amount", "1"));
      assertEquals("1", session.engine.getRuntimeService().getVariable(called, "amount"));
      assertEquals(Map.of("amount", "25000", "applicant", "Ada"), session.engine.getRuntimeService().getVariables(loan));
      session.complete(called, "RecordVerdict", Map.of("verdict", "approved"));
      assertEquals(Map.of("amount", "25000", "applicant", "Ada", "decision", "approved", "echoedCustomer", "Ada"),
          session.engine.getRuntimeService().getVariablesLocal(loan));
      session.complete(loan, "ConfirmDecision", Map.of("decision", "referred"));
      session.assertEnded(loan, Map.of("amount", "25000", "applicant", "Ada", "decision", "referred", "echoedCustomer", "Ada"));
    }
  }

  @Test
  public void aPresentNullSourceIsCopiedAsAPresentNull() throws Exception {
    try (var session = new Session()) {
      var start = new HashMap<String, Object>();
      start.put("amount", "9000");
      start.put("applicant", null);
      var loan = session.start(start);
      session.acknowledge(loan);
      var called = session.called(loan);
      var copied = session.engine.getRuntimeService().getVariablesLocal(called);
      assertTrue(copied.containsKey("customer"));
      assertEquals(null, copied.get("customer"));
      session.complete(called, "CollectDocument", Map.of());
      session.complete(called, "RecordVerdict", Map.of("verdict", "approved"));
      session.complete(loan, "ConfirmDecision", Map.of());
      var expected = new HashMap<String, Object>(Map.of("amount", "9000", "decision", "approved"));
      expected.put("applicant", null);
      expected.put("echoedCustomer", null);
      session.assertEnded(loan, expected);
    }
  }

  @Test
  public void anAbsentSourceAndANeverSetOutputBecomePresentNulls() throws Exception {
    try (var session = new Session()) {
      var loan = session.start(Map.of("amount", "25000", "decision", "old"));
      session.acknowledge(loan);
      var called = session.called(loan);
      var copied = session.engine.getRuntimeService().getVariablesLocal(called);
      assertTrue(copied.containsKey("customer"));
      assertEquals(null, copied.get("customer"));
      assertFalse(copied.containsKey("decision"));
      session.complete(called, "CollectDocument", Map.of());
      session.complete(called, "RecordVerdict", Map.of());
      var returned = session.engine.getRuntimeService().getVariablesLocal(loan);
      assertTrue(returned.containsKey("decision"));
      assertEquals(null, returned.get("decision"));
      assertEquals(null, returned.get("echoedCustomer"));
      session.complete(loan, "ConfirmDecision", Map.of());
      var expected = new HashMap<String, Object>(Map.of("amount", "25000"));
      expected.put("decision", null);
      expected.put("echoedCustomer", null);
      session.assertEnded(loan, expected);
    }
  }

  private static final class Session implements AutoCloseable {
    final ProcessEngine engine;
    final String deployment;

    Session() throws Exception {
      JavaDelegate acknowledge = execution -> assertTrue(execution.hasVariable("amount"));
      engine = CibSevenTestEngine.create("call-variable-mapping",
          configuration -> configuration.setBeans(Map.of("acknowledgeApplication", acknowledge)));
      try {
        deployment = engine.getRepositoryService().createDeployment()
            .addString("loan-application.bpmn", Files.readString(MODEL)).deploy().getId();
      } catch (RuntimeException | Error failure) {
        engine.close();
        throw failure;
      }
    }

    String start(Map<String, Object> variables) {
      return engine.getRuntimeService().startProcessInstanceByKey("Process_LoanApplication", variables).getId();
    }

    void acknowledge(String loan) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(loan).singleResult();
      assertNotNull(job);
      engine.getManagementService().executeJob(job.getId());
    }

    String called(String loan) {
      var called = engine.getRuntimeService().createProcessInstanceQuery().superProcessInstanceId(loan).singleResult();
      assertNotNull(called);
      return called.getId();
    }

    void complete(String instance, String element, Map<String, Object> patch) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance)
          .taskDefinitionKey(element).singleResult();
      assertNotNull(task);
      engine.getTaskService().complete(task.getId(), new HashMap<>(patch));
    }

    void assertEnded(String loan, Map<String, Object> expected) {
      assertEquals(0, engine.getRuntimeService().createProcessInstanceQuery().processInstanceId(loan).count());
      var actual = new HashMap<String, Object>();
      for (var variable : engine.getHistoryService().createHistoricVariableInstanceQuery().processInstanceId(loan).list()) {
        if (variable.getActivityInstanceId().equals(loan) || variable.getExecutionId().equals(loan)) {
          actual.put(variable.getName(), variable.getValue());
        }
      }
      assertEquals(expected, actual);
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
