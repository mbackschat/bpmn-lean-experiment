package org.bpmnlean.cibseven;

import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.EFFECT;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.TIMER;
import static org.bpmnlean.cibseven.ScenarioProtocol.WaitKind.USER_TASK;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.List;
import org.bpmnlean.cibseven.ScenarioProtocol.ActiveWait;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectDescriptor;
import org.bpmnlean.cibseven.ScenarioProtocol.EffectOccurrenceId;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenEffect;
import org.bpmnlean.cibseven.ScenarioProtocol.OpenTimer;
import org.bpmnlean.cibseven.ScenarioProtocol.TimerOccurrenceId;
import org.junit.Test;

/** Locks the loud Timer singleton guard and canonical kind-then-element wait ordering. */
public class CibSevenActiveWaitProjectorTest {

  private final CibSevenActiveWaitProjector projector =
      new CibSevenActiveWaitProjector();

  @Test
  public void ordersMixedWaitsByKindThenElementId() {
    assertEquals(
        List.of(
            new ActiveWait("Z_UserTask", USER_TASK, 1),
            new ActiveWait("A_Timer", TIMER, 1),
            new ActiveWait("M_Effect", EFFECT, 1)),
        projector.project(
            List.of(new ActiveWait("Z_UserTask", USER_TASK, 1)),
            List.of(openTimer("A_Timer")),
            List.of(openEffect("M_Effect"))));
  }

  @Test
  public void rejectsRepeatedTimerElementWithoutInventingMultiplicity() {
    assertThrows(
        IllegalStateException.class,
        () ->
            projector.project(
                List.of(),
                List.of(openTimer("Timer_A"), openTimer("Timer_A")),
                List.of()));
  }

  private static OpenTimer openTimer(String elementId) {
    return new OpenTimer(
        new TimerOccurrenceId("Instance_1", elementId, 1),
        1000);
  }

  private static OpenEffect openEffect(String elementId) {
    return new OpenEffect(
        new EffectOccurrenceId("Instance_1", elementId, 1),
        new EffectDescriptor(
            CibSevenEffectProjector.EFFECT_PROTOCOL,
            CibSevenEffectProjector.HANDLER_BEAN),
        List.of());
  }
}
