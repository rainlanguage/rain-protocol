import { ethers } from "hardhat";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../../typechain/contracts/flow/FlowCommon";
import { StakeFactory } from "../../../../typechain/contracts/stake/StakeFactory";
import { getRainContractMetaBytes } from "../../../meta";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

// export const stakeFactoryDeploy = async () => {
//   const stakeFactoryFactory = await ethers.getContractFactory(
//     "StakeFactory",
//     {}
//   );
//   const touchDeployer = await getTouchDeployer();
//   const config_: InterpreterCallerV1ConstructionConfigStruct = {
//     callerMeta: getRainContractMetaBytes("sale"),
//     deployer: touchDeployer.address,
//   };
//   const stakeFactory = (await stakeFactoryFactory.deploy(
//     config_
//   )) as StakeFactory;
//   await stakeFactory.deployed();
//   return stakeFactory;
// };
