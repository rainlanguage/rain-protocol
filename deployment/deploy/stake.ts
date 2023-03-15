import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployer,
  Stake as StakeType,
} from "../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployStake = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const stakeFactory = await ethers.getContractFactory("Stake");

  const interpreterCallerConfig: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("stake"),
    deployer: deployer_.address,
  };

  const Stake = (await stakeFactory.deploy(
    interpreterCallerConfig
  )) as StakeType;

  registerContract("Stake", Stake.address, interpreterCallerConfig);
};
