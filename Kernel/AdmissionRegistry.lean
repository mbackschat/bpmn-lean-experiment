module

public import Kernel.Admission.Flow
public import Kernel.Admission.Work
public import Kernel.Admission.Propagation

/-! # Admission registry: the first refusal of any element, in program order. Only `Kernel.Run` imports it. -/

public section

namespace Kernel.AdmissionRegistry

def element : Element → Option String
  | .activity _ payload => Admission.Work.activity payload
  | .scope _ _ => some "scope"
  | .event _ payload => Admission.Propagation.event payload
  | .gateway _ payload => Admission.Flow.gateway payload
  | .start _ payload => Admission.Flow.start payload

def admit (program : Program) : Option String :=
  program.elements.findSome? element

end Kernel.AdmissionRegistry
