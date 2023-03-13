import { ethers } from "hardhat";
import { FlowERC721 as FlowERC721Type, RainterpreterExpressionDeployer } from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployFlowErc721 = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("FlowERC721");

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("flow721"),
    deployer: deployer_.address,
  };

  const FlowERC721 = (await flowFactory.deploy(
    interpreterCallerConfig
  )) as FlowERC721Type;

  registerContract("FlowERC721", FlowERC721.address);
};
