import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../typechain";
import {
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { getEventArgs } from "../../../events";

export const flowERC1155Deploy = async (
  deployer: SignerWithAddress,
  flowERC1155Factory: FlowERC1155Factory,
  stateConfigStruct: FlowERC1155ConfigStruct,
  ...args: Overrides[]
): Promise<FlowERC1155> => {
  const txDeploy = await flowERC1155Factory.createChildTyped(
    stateConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC1155Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC1155")).abi,
    deployer
  ) as FlowERC1155;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};
