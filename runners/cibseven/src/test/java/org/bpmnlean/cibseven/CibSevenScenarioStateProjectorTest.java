package org.bpmnlean.cibseven;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.Date;
import org.junit.Test;

/** Guards the root-only CIB projection boundary against silently omitted child instances. */
public class CibSevenScenarioStateProjectorTest {

  private static final String CHILD_RESOURCE =
      "org/bpmnlean/cibseven/CibSevenScenarioStateProjectorTest.childProcess.bpmn";

  @Test
  public void rejectsAChildProcessInsteadOfProjectingOnlyTheRoot() {
    var engine = CibSevenTestEngine.create("state-projector-child");
    try {
      var deployment =
          engine
              .getRepositoryService()
              .createDeployment()
              .addClasspathResource(CHILD_RESOURCE)
              .deploy();
      try {
        var root =
            engine.getRuntimeService().startProcessInstanceByKey("ProjectorParent");
        assertEquals(
            1,
            engine
                .getRuntimeService()
                .createProcessInstanceQuery()
                .superProcessInstanceId(root.getId())
                .count());
        var projector =
            new CibSevenScenarioStateProjector(
                engine,
                new CibSevenUserTaskProjector(),
                new CibSevenEffectProjector(),
                new CibSevenActiveWaitProjector(),
                new Date(0));

        assertThrows(
            IllegalStateException.class,
            () -> projector.observeState(root.getId(), "Instance_1", "start-process"));
      } finally {
        engine
            .getRepositoryService()
            .deleteDeployment(deployment.getId(), true, true, true);
      }
    } finally {
      engine.close();
    }
  }
}
