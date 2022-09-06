import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { Flow, FlowFactory } from "../../../typechain";
import { StateConfigStruct } from "../../../typechain/contracts/flow/Flow";
import { getEventArgs } from "../../events";

export const flowDeploy = async (
  deployer: SignerWithAddress,
  flowFactory: FlowFactory,
  stateConfigStruct: StateConfigStruct,
  ...args: Overrides[]
): Promise<Flow> => {
  const txDeploy = await flowFactory.createChildTyped(
    stateConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Flow")).abi,
    deployer
  ) as Flow;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};
