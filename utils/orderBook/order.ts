import { BigNumber } from "ethers";
import { BytesLike, concat } from "ethers/lib/utils";
import { PromiseOrValue } from "../../typechain/common";
import { OrderConfigStruct } from "../../typechain/contracts/orderbook/IOrderBookV1";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../interpreter";

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
    data: orderData || [],
  };

  return orderConfig;
};
