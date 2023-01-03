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
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";

export const flowERC1155Deploy = async (
  deployer: SignerWithAddress,
  flowERC1155Factory: FlowERC1155Factory,
  flowERC1155Config: FlowERC1155Config,
  ...args: Overrides[]
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );

  const flowERC1155ConfigStruct: FlowERC1155ConfigStruct = {
    stateConfig: flowERC1155Config.stateConfig,
    flowConfig: {
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      flows: flowERC1155Config.flows,
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

  return { flow, interpreter, expressionDeployer };
};
