import { ethers } from "hardhat";
import { FlowERC1155 as FlowERC1155Type, RainterpreterExpressionDeployer } from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";
import { verifyContract } from "../verify";

export const deployFlowErc1155 = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("FlowERC1155");

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("flow1155"),
    deployer: deployer_.address,
  };

  const FlowERC1155 = (await flowFactory.deploy(
    interpreterCallerConfig
  )) as FlowERC1155Type;

  registerContract("FlowERC1155", FlowERC1155.address);
  verifyContract("FlowERC1155", FlowERC1155.address, interpreterCallerConfig);
};
