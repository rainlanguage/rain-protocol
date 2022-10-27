import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../typechain";
import {
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { getEventArgs } from "../../../events";
import { FlowERC1155Config } from "../../../types/flow";
import { rainterpreterExpressionDeployerV1 } from "../../interpreter/shared/rainterpreterExpressionDeployerV1/deploy";
import { rainterpreterV1Deploy } from "../../interpreter/shared/rainterpreterV1/deploy";

export const flowERC1155Deploy = async (
  deployer: SignerWithAddress,
  flowERC1155Factory: FlowERC1155Factory,
  flowERC1155Config: FlowERC1155Config,
  ...args: Overrides[]
): Promise<FlowERC1155> => {
  const interpreter = await rainterpreterV1Deploy();
  const expressionDeployer = await rainterpreterExpressionDeployerV1(
    interpreter
  );

  const flowERC1155ConfigStruct: FlowERC1155ConfigStruct = {
    stateConfig: flowERC1155Config.stateConfig,
    flowConfig: {
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      flows: flowERC1155Config.flows,
      flowFinalMinStack: 4,
    },
    uri: flowERC1155Config.uri,
  };

  const txDeploy = await flowERC1155Factory.createChildTyped(
    flowERC1155ConfigStruct,
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
