import { AllStandardOps } from "./allStandardOps";

export const AutoApproveOps = {
  EVIDENCE_DATA_APPROVED: 0 + AllStandardOps.length,
};

export const Opcode = {
  ...AllStandardOps,
  ...AutoApproveOps,
};
