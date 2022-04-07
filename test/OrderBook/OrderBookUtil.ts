import * as Util from "../Util";

export const OrderBookOps = {
  OPCODE_COUNTERPARTY: 0 + Util.AllStandardOps.length,
  OPCODE_COUNTERPARTY_FUNDS_CLEARED: 1 + Util.AllStandardOps.length,
  OPCODE_ORDER_FUNDS_CLEARED: 2 + Util.AllStandardOps.length,
};

export const Opcode = {
  ...Util.AllStandardOps,
  ...OrderBookOps,
};
