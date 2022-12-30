import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC721Factory } from "../../../../typechain";
import {
  FlowERC721,
  FlowERC721ConfigStruct,
} from "../../../../typechain/contracts/flow/erc721/FlowERC721";
import { getEventArgs } from "../../../events";
import { FlowERC721Config } from "../../../types/flow";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";

export const flowERC721Deploy = async (
  deployer: SignerWithAddress,
  flowERC721Factory: FlowERC721Factory,
  flowERC721Config: FlowERC721Config,
  ...args: Overrides[]
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );

  const flowERC20ConfigStruct: FlowERC721ConfigStruct = {
    stateConfig: flowERC721Config.stateConfig,
    flowConfig: {
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      flows: flowERC721Config.flows,
    },
    name: flowERC721Config.name,
    symbol: flowERC721Config.symbol,
  };

  const txDeploy = await flowERC721Factory.createChildTyped(
    flowERC20ConfigStruct,
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

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return { flow, interpreter, expressionDeployer };
};
