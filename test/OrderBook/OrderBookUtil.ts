import * as Util from "../Util";

export const OrderBookOps = {
  COUNTERPARTY_FUNDS_CLEARED: 0 + Util.AllStandardOps.length,
  ORDER_FUNDS_CLEARED: 1 + Util.AllStandardOps.length,
};

export const Opcode = {
  ...Util.AllStandardOps,
  ...OrderBookOps,
};
