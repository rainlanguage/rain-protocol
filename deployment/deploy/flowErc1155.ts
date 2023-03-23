import { ethers } from "hardhat";
import {
  FlowERC1155 as FlowERC1155Type,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployFlowErc1155 = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const flowFactory = await ethers.getContractFactory("FlowERC1155");

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("flow1155"),
      deployer: deployer_.address,
    };

  const FlowERC1155 = (await flowFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as FlowERC1155Type;

  registerContract(
    "FlowERC1155",
    FlowERC1155.address,
    deployerDiscoverableMetaConfig
  );
};
