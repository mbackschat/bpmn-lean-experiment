package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.delegate.BpmnError;
import org.cibseven.bpm.engine.delegate.JavaDelegate;
import org.cibseven.bpm.engine.impl.bpmn.parser.BpmnParse;
import org.cibseven.bpm.engine.task.Task;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.ServiceTask;
import org.junit.Test;

public final class CibSevenBusinessFailurePhaseZeroProbeTest {
  private static final String PROCESS = "InvoiceRecovery";
  private static final String ERROR_CODE = "InvoiceRejected";

  private enum Outcome { SUCCESS, BUSINESS_ERROR, BUSINESS_ERROR_WITHOUT_RESULT, TECHNICAL_FAILURE }
  private enum OutputMapping { LOCAL, LITERAL, NONE }
  private record Invocation(String activityInstance, Object payload) {}

  @Test
  public void caughtErrorMapsTheLocalResultAndAbandonsNormalCompletion() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(true);
      fixture.review(instance, "rejected-invoice");
      fixture.execute(instance);
      fixture.assertRecovery(instance, "rejected-invoice");
      assertEquals("parent-result", fixture.engine.getRuntimeService().getVariable(instance, "result"));
      assertEquals(0, fixture.engine.getRuntimeService().createVariableInstanceQuery()
          .processInstanceIdIn(instance).variableName("payload").count());
    }
  }

  @Test
  public void caughtErrorPreservesPresentNullRatherThanFallingBackToParent() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(true);
      fixture.review(instance, null);
      fixture.execute(instance);
      fixture.assertRecovery(instance, null);
      assertEquals("parent-result", fixture.engine.getRuntimeService().getVariable(instance, "result"));
    }
  }

  @Test
  public void recoveryReentersReviewWithFreshTaskAndAutomationOccurrences() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(true);
      String firstReview = fixture.task(instance, "Review").getId();
      fixture.review(instance, "rejected-invoice");
      fixture.execute(instance);
      fixture.assertRecovery(instance, "rejected-invoice");
      fixture.engine.getTaskService().complete(fixture.task(instance, "Recover").getId());
      assertNotEquals(firstReview, fixture.task(instance, "Review").getId());
      var before = fixture.engine.getRuntimeService().getVariables(instance);
      assertThrows(RuntimeException.class, () -> fixture.engine.getTaskService().complete(firstReview));
      assertEquals(before, fixture.engine.getRuntimeService().getVariables(instance));
      fixture.outcome.set(Outcome.SUCCESS);
      fixture.review(instance, "corrected-invoice");
      fixture.execute(instance);
      assertEquals(List.of("rejected-invoice", "corrected-invoice"),
          fixture.calls.stream().map(Invocation::payload).toList());
      assertNotEquals(fixture.calls.get(0).activityInstance(), fixture.calls.get(1).activityInstance());
      fixture.assertTasks(instance, "Finalize");
      assertEquals("corrected-invoice", fixture.engine.getRuntimeService().getVariable(instance, "decision"));
      fixture.engine.getTaskService().complete(fixture.task(instance, "Finalize").getId());
      assertEquals(0, fixture.engine.getRuntimeService().createProcessInstanceQuery()
          .processInstanceId(instance).count());
    }
  }

  @Test
  public void technicalFailureRollsBackLocalWritesAndRetainsTheJobWithoutBoundaryWork() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(true);
      fixture.review(instance, "reviewed-invoice");
      fixture.outcome.set(Outcome.TECHNICAL_FAILURE);
      String job = fixture.jobId(instance);
      var before = fixture.engine.getRuntimeService().getVariables(instance);
      assertThrows(RuntimeException.class, () -> fixture.execute(instance));
      fixture.assertTasks(instance);
      assertEquals(before, fixture.engine.getRuntimeService().getVariables(instance));
      assertEquals(2, fixture.engine.getManagementService().createJobQuery().jobId(job)
          .singleResult().getRetries());
      assertEquals(0, fixture.engine.getRuntimeService().createIncidentQuery().processInstanceId(instance).count());
      fixture.outcome.set(Outcome.SUCCESS);
      assertEquals(job, fixture.jobId(instance));
      fixture.execute(instance);
      fixture.assertTasks(instance, "Finalize");
      assertEquals("reviewed-invoice", fixture.engine.getRuntimeService().getVariable(instance, "decision"));
    }
  }

  @Test
  public void unmatchedErrorWithOutputMappingFailsDuringRootCleanup() {
    for (var mapping : List.of(OutputMapping.LOCAL, OutputMapping.LITERAL)) {
      try (var fixture = new Fixture("OtherRejection", mapping)) {
        String instance = fixture.start(true);
        fixture.review(instance, "rejected-invoice");
        var before = fixture.engine.getRuntimeService().getVariables(instance);
        var failure = assertThrows(NullPointerException.class, () -> fixture.execute(instance));
        assertEquals("org.cibseven.bpm.engine.impl.core.variable.mapping.OutputParameter",
            failure.getStackTrace()[0].getClassName());
        fixture.assertTasks(instance);
        assertEquals(before, fixture.engine.getRuntimeService().getVariables(instance));
        assertEquals(2, fixture.engine.getManagementService().createJobQuery()
            .jobId(fixture.jobId(instance)).singleResult().getRetries());
      }
    }
  }

  @Test
  public void mappingFreeUnmatchedErrorEndsWithoutTakingEitherRoute() {
    try (var fixture = new Fixture("OtherRejection", OutputMapping.NONE)) {
      String instance = fixture.start(true);
      fixture.review(instance, "rejected-invoice");
      fixture.execute(instance);
      fixture.assertTasks(instance);
      assertEquals(0, fixture.engine.getRuntimeService().createProcessInstanceQuery()
          .processInstanceId(instance).count());
      assertEquals(0, fixture.engine.getHistoryService().createHistoricActivityInstanceQuery()
          .processInstanceId(instance).activityId("End").count());
      assertEquals(0, fixture.engine.getManagementService().createJobQuery().processInstanceId(instance).count());
    }
  }

  @Test
  public void absentErrorLocalResultCanResolveTheParentBinding() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(true);
      fixture.review(instance, "rejected-invoice");
      fixture.outcome.set(Outcome.BUSINESS_ERROR_WITHOUT_RESULT);
      fixture.execute(instance);
      fixture.assertRecovery(instance, "parent-result");
    }
  }

  @Test
  public void absentErrorResultInBothScopesMakesOutputMappingFailBeforeRecovery() {
    try (var fixture = new Fixture()) {
      String instance = fixture.start(false);
      fixture.review(instance, "rejected-invoice");
      fixture.outcome.set(Outcome.BUSINESS_ERROR_WITHOUT_RESULT);
      var before = fixture.engine.getRuntimeService().getVariables(instance);
      var failure = assertThrows(RuntimeException.class, () -> fixture.execute(instance));
      assertTrue(failure.getMessage().contains("result"));
      fixture.assertTasks(instance);
      assertEquals(before, fixture.engine.getRuntimeService().getVariables(instance));
      assertEquals(2, fixture.engine.getManagementService().createJobQuery()
          .jobId(fixture.jobId(instance)).singleResult().getRetries());
    }
  }

  private static BpmnModelInstance invoiceModel(String declaredCode, OutputMapping mapping) {
    var validate = Bpmn.createExecutableProcess(PROCESS)
        .startEvent("Start").exclusiveGateway("ReviewMerge")
        .userTask("Review").name("Review invoice")
        .serviceTask("Validate").name("Validate reviewed invoice")
        .camundaDelegateExpression("${invoiceValidator}").camundaAsyncBefore()
        .camundaInputParameter("payload", "${request}");
    switch (mapping) {
      case LOCAL -> validate.camundaOutputParameter("decision", "${result}");
      case LITERAL -> validate.camundaOutputParameter("decision", "fixed-decision");
      case NONE -> { }
    }
    var model = validate
        .userTask("Finalize").name("Record accepted invoice")
        .endEvent("End").done();
    model.<ServiceTask>getModelElementById("Validate").builder()
        .boundaryEvent("ValidationError").error(declaredCode)
        .userTask("Recover").name("Resolve invoice rejection").connectTo("ReviewMerge");
    Bpmn.validateModel(model);
    return model;
  }

  private static final class Fixture implements AutoCloseable {
    private final ProcessEngine engine;
    private final String deployment;
    private final AtomicReference<Outcome> outcome = new AtomicReference<>(Outcome.BUSINESS_ERROR);
    private final List<Invocation> calls = new ArrayList<>();

    private Fixture() {
      this(ERROR_CODE, OutputMapping.LOCAL);
    }

    private Fixture(String declaredCode, OutputMapping mapping) {
      var parse = new AtomicReference<BpmnParse>();
      JavaDelegate handler = execution -> {
        assertTrue(execution.hasVariableLocal("payload"));
        Object payload = execution.getVariableLocal("payload");
        calls.add(new Invocation(execution.getActivityInstanceId(), payload));
        if (outcome.get() != Outcome.BUSINESS_ERROR_WITHOUT_RESULT) execution.setVariableLocal("result", payload);
        switch (outcome.get()) {
          case SUCCESS -> { }
          case BUSINESS_ERROR -> throw new BpmnError(ERROR_CODE, "Invoice needs correction");
          case BUSINESS_ERROR_WITHOUT_RESULT -> throw new BpmnError(ERROR_CODE);
          case TECHNICAL_FAILURE -> throw new IllegalStateException("validator unavailable");
        }
      };
      engine = CibSevenTestEngine.create("business-failure", configuration -> {
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
            .addModelInstance("invoice-recovery.bpmn", invoiceModel(declaredCode, mapping)).deploy().getId();
        assertNotNull(parse.get());
        assertFalse(parse.get().hasWarnings());
        deployment = created;
      } catch (RuntimeException | Error failure) {
        if (created != null) engine.getRepositoryService().deleteDeployment(created, true);
        engine.close();
        throw failure;
      }
    }

    private String start(boolean parentResult) {
      var variables = new HashMap<String, Object>();
      variables.put("request", "unreviewed-invoice");
      if (parentResult) variables.put("result", "parent-result");
      return engine.getRuntimeService().startProcessInstanceByKey(PROCESS, variables).getId();
    }

    private void review(String instance, String request) {
      var patch = new HashMap<String, Object>();
      patch.put("request", request);
      engine.getTaskService().complete(task(instance, "Review").getId(), patch);
    }

    private Task task(String instance, String element) {
      var task = engine.getTaskService().createTaskQuery().processInstanceId(instance)
          .taskDefinitionKey(element).singleResult();
      assertNotNull(task);
      return task;
    }

    private String jobId(String instance) {
      var job = engine.getManagementService().createJobQuery().processInstanceId(instance).singleResult();
      assertNotNull(job);
      return job.getId();
    }

    private void execute(String instance) {
      engine.getManagementService().executeJob(jobId(instance));
    }

    private void assertTasks(String instance, String... expected) {
      assertEquals(List.of(expected), engine.getTaskService().createTaskQuery()
          .processInstanceId(instance).list().stream().map(Task::getTaskDefinitionKey).sorted().toList());
    }

    private void assertRecovery(String instance, Object decision) {
      assertTasks(instance, "Recover");
      assertTrue(engine.getRuntimeService().getVariables(instance).containsKey("decision"));
      assertEquals(decision, engine.getRuntimeService().getVariable(instance, "decision"));
      assertEquals(0, engine.getManagementService().createJobQuery().processInstanceId(instance).count());
      assertEquals(0, engine.getRuntimeService().createIncidentQuery().processInstanceId(instance).count());
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
