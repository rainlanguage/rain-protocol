import * as Util from "../../utils";

export const OrderBookOps = {
  ORDER_FUNDS_CLEARED: 0 + Util.AllStandardOps.length,
  COUNTERPARTY_FUNDS_CLEARED: 1 + Util.AllStandardOps.length,
};

export const Opcode = {
  ...Util.AllStandardOps,
  ...OrderBookOps,
};
