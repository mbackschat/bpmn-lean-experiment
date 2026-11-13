package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import java.util.function.UnaryOperator;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PvmActivityProjection;
import org.bpmnlean.cibseven.ScenarioDiagnosticsProtocol.PvmDefinitionProjection;
import org.cibseven.bpm.engine.ProcessEngine;
import org.cibseven.bpm.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.cibseven.bpm.model.bpmn.Bpmn;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.builder.StartEventBuilder;
import org.junit.Test;

/**
 * The definition projection reports the initial activity CIB's parser selected (`BpmnParse#selectInitial`): the Process's
 * one none or timer start, else its only start of any type, else none. A Process whose several starts are all typed
 * events has none, and the projection says so instead of failing the run that deploys it.
 */
public class CibSevenPvmDefinitionProjectorTest {

  private static final String WORK = "Work";

  /** Several starts, all typed, leave the Process without an initial activity, whichever event type they are. */
  @Test
  public void projectsTwoTypedStartsAsHavingNoInitialActivity() {
    var engine = CibSevenTestEngine.create("pvm-no-initial");
    try {
      var cases =
          List.of(
              new Deployed("Process_TwoMessages", message("OrderPlaced"), message("OrderAmended")),
              new Deployed("Process_TwoSignals", signal("ShiftOpened"), signal("ShiftClosed")),
              new Deployed("Process_TwoConditions", condition("${amount >= 1000}"), condition("${urgent}")));
      for (var deployed : cases) {
        var projection = project(engine, deployed);

        assertEquals(deployed.process(), projection.processId());
        assertNull(deployed.process(), projection.initialActivityId());
        var ids = projection.activities().stream().map(PvmActivityProjection::id).toList();
        assertTrue(deployed.process() + " " + ids, ids.containsAll(List.of("Start1", "Start2", WORK, "End")));
      }
    } finally {
      engine.close();
    }
  }

  /** A Process with a none or timer start, or with one start of any type, keeps the initial activity CIB selected. */
  @Test
  public void keepsTheInitialActivityCibSelected() {
    var engine = CibSevenTestEngine.create("pvm-initial");
    try {
      assertEquals(
          "Start1", project(engine, new Deployed("Process_OneMessage", message("OrderCancelled"))).initialActivityId());
      assertEquals(
          "Start1",
          project(engine, new Deployed("Process_NoneThenMessage", none(), message("OrderAmended"))).initialActivityId());
      assertEquals(
          "Start2",
          project(engine, new Deployed("Process_MessageThenNone", message("OrderPlaced"), none())).initialActivityId());
    } finally {
      engine.close();
    }
  }

  private static PvmDefinitionProjection project(ProcessEngine engine, Deployed deployed) {
    var deployment =
        engine.getRepositoryService().createDeployment().addModelInstance(deployed.process() + ".bpmn", deployed.model())
            .deploy();
    var definition =
        engine.getRepositoryService().createProcessDefinitionQuery().deploymentId(deployment.getId()).singleResult();
    return new PvmDefinitionProjector()
        .project(
            (ProcessEngineConfigurationImpl) engine.getProcessEngineConfiguration(), definition.getId(), definition.getKey());
  }

  /** A Process of the given starts, `Start1`, `Start2` and so on in order, all leading to one User Task and one End. */
  private record Deployed(String process, List<UnaryOperator<StartEventBuilder>> starts) {

    @SafeVarargs
    private Deployed(String process, UnaryOperator<StartEventBuilder>... starts) {
      this(process, List.of(starts));
    }

    private BpmnModelInstance model() {
      var first = Bpmn.createExecutableProcess(process).startEvent("Start1");
      var model = starts.getFirst().apply(first).userTask(WORK).endEvent("End").done();
      var builder = model.<org.cibseven.bpm.model.bpmn.instance.Process>getModelElementById(process).builder();
      for (var index = 1; index < starts.size(); index++) {
        starts.get(index).apply(builder.startEvent("Start" + (index + 1))).connectTo(WORK);
      }
      return model;
    }
  }

  private static UnaryOperator<StartEventBuilder> none() {
    return UnaryOperator.identity();
  }

  private static UnaryOperator<StartEventBuilder> message(String name) {
    return start -> start.message(name);
  }

  private static UnaryOperator<StartEventBuilder> signal(String name) {
    return start -> start.signal(name);
  }

  private static UnaryOperator<StartEventBuilder> condition(String expression) {
    return start -> start.condition(expression);
  }
}
