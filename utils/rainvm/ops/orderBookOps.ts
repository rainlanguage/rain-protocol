import { AllStandardOps } from "./allStandardOps";

export const OrderBookOps = {
  ORDER_FUNDS_CLEARED: 0 + AllStandardOps.length,
  COUNTERPARTY_FUNDS_CLEARED: 1 + AllStandardOps.length,
};

export const OrderBookOpcode = {
  ...AllStandardOps,
  ...OrderBookOps,
};
