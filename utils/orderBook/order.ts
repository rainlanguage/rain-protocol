import { BigNumber, ethers } from "ethers";
import { BytesLike, concat, hexlify } from "ethers/lib/utils";
import { PromiseOrValue } from "../../typechain/common";
import { OrderConfigStruct } from "../../typechain/contracts/orderbook/OrderBook";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../interpreter";
import { MAGIC_NUMBERS } from "../meta/cbor";

export const getOrderConfig = async (
  ratio: BigNumber,
  opMax: BigNumber,
  inputTokenAddress: PromiseOrValue<string>,
  inputTokenDecimals: number,
  inputVault: BigNumber,
  outputTokenAddress: PromiseOrValue<string>,
  outputTokenDecimals: number,
  outputVault: BigNumber,
  orderData: BytesLike
): Promise<OrderConfigStruct> => {
  const constants = [opMax, ratio];
  const vOpMax = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
  const vRatio = op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
  // prettier-ignore
  const source = concat([
      vOpMax,
      vRatio,
    ]);
  const evaluableConfig = await generateEvaluableConfig(
    [source, []],
    constants
  );
  const orderConfig: OrderConfigStruct = {
    validInputs: [
      {
        token: inputTokenAddress,
        decimals: inputTokenDecimals,
        vaultId: inputVault,
      },
    ],
    validOutputs: [
      {
        token: outputTokenAddress,
        decimals: outputTokenDecimals,
        vaultId: outputVault,
      },
    ],
    evaluableConfig,
    meta: orderData,
  };

  return orderConfig;
};

export const encodeMeta = (data: string) => {
  return (
    "0x" +
    MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase() +
    hexlify(ethers.utils.toUtf8Bytes(data)).split("x")[1]
  );
};
