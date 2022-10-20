import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import {
  Flow,
  FlowERC1155Factory,
  FlowERC20Factory,
  FlowERC721Factory,
  FlowFactory,
} from "../../../typechain";
import { FlowConfigStruct } from "../../../typechain/contracts/flow/basic/Flow";
import {
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import {
  FlowERC20,
  FlowERC20ConfigStruct,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";
import {
  FlowERC721,
  FlowERC721ConfigStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { getEventArgs } from "../../events";

export const flowDeploy = async (
  deployer: SignerWithAddress,
  flowFactory: FlowFactory,
  flowConfigStruct: FlowConfigStruct,
  ...args: Overrides[]
): Promise<Flow> => {
  const txDeploy = await flowFactory.createChildTyped(
    flowConfigStruct,
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

export const flowERC20Deploy = async (
  deployer: SignerWithAddress,
  flowERC20Factory: FlowERC20Factory,
  stateConfigStruct: FlowERC20ConfigStruct,
  ...args: Overrides[]
): Promise<FlowERC20> => {
  const txDeploy = await flowERC20Factory.createChildTyped(
    stateConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC20Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC20")).abi,
    deployer
  ) as FlowERC20;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};

export const flowERC721Deploy = async (
  deployer: SignerWithAddress,
  flowERC721Factory: FlowERC721Factory,
  stateConfigStruct: FlowERC721ConfigStruct,
  ...args: Overrides[]
): Promise<FlowERC721> => {
  const txDeploy = await flowERC721Factory.createChildTyped(
    stateConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC721Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC721")).abi,
    deployer
  ) as FlowERC721;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};

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

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};
