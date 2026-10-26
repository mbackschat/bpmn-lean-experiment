module

import BpmnSemantics.SemanticProcess.SequentialMultiInstanceTransition
public import BpmnSemantics.SemanticProcess.SequentialMultiInstanceRewrite

/-! The reviewed Sequential Multi-Instance data-role identities, apart from the program-binding proofs so
an executable check can use them without importing a proof owner. -/

@[expose] public section

namespace BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def dataDefinition : SequentialMultiInstanceDataDefinition :=
  { input :=
      { collectionItemDefinitionId := "ItemDefinition_StringList"
        scalarItemDefinitionId := "ItemDefinition_String"
        dataObjectId := "DataObject_InputItems"
        dataObjectReferenceId := "DataObjectReference_InputItems"
        loopDataInputId := "DataInput_Items"
        inputDataItemId := "InputDataItem_CurrentItem"
        taskDataInputId := "DataInput_CurrentItem"
        collectionAssociationId := "DataInputAssociation_Items"
        itemAssociationId := "DataInputAssociation_CurrentItem" }
    output :=
      { dataObjectId := "DataObject_OutputResults"
        dataObjectReferenceId := "DataObjectReference_OutputResults"
        taskDataOutputId := "DataOutput_CurrentResult"
        outputDataItemId := "OutputDataItem_CurrentResult"
        loopDataOutputId := "DataOutput_Results"
        itemAssociationId := "DataOutputAssociation_CurrentResult"
        collectionAssociationId := "DataOutputAssociation_Results" } }

end BpmnSemantics.SequentialMultiInstanceProgramBindingConformance
