import * as Util from "../Util";

export const OrderBookOps = {
  COUNTERPARTY: 0 + Util.AllStandardOps.length,
  COUNTERPARTY_FUNDS_CLEARED: 1 + Util.AllStandardOps.length,
  ORDER_FUNDS_CLEARED: 2 + Util.AllStandardOps.length,
};

export const Opcode = {
  ...Util.AllStandardOps,
  ...OrderBookOps,
};
