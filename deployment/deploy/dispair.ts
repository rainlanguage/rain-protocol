import { ethers } from "hardhat";

import { registerContract } from "../utils";
import { Rainterpreter, RainterpreterStore } from "../../typechain";
import { getRainMetaDocumentFromOpmeta } from "../../utils";
import {
  RainterpreterExpressionDeployer,
  RainterpreterExpressionDeployerConstructionConfigStruct,
} from "../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { verifyContract } from "../verify";

export const deployDISpair = async function () {
  // Rainterpreter
  const Rainterpreter = await deployRainterpreter();

  // RainterpreterStore
  const RainterpreterStore = await deployRainterpreterStore();

  // RainterpreterExpressionDeployer
  const deployerConfig: RainterpreterExpressionDeployerConstructionConfigStruct =
    {
      interpreter: Rainterpreter.address,
      store: RainterpreterStore.address,
      meta: getRainMetaDocumentFromOpmeta(),
    };

  const RainterpreterExpressionDeployer =
    await deployRainterpreterExpressionDeployer(deployerConfig);

  const contracts = {
    Rainterpreter,
    RainterpreterStore,
    RainterpreterExpressionDeployer,
  };

  // Saving addresses deployed
  Object.entries(contracts).forEach((item_) => {
    registerContract(item_[0], item_[1].address);
  });

  // Calling verification
  verifyContract("Rainterpreter", Rainterpreter.address);
  verifyContract("RainterpreterStore", RainterpreterStore.address);
  verifyContract(
    "RainterpreterExpressionDeployer",
    RainterpreterExpressionDeployer.address,
    deployerConfig
  );

  return contracts;
};

async function deployRainterpreter() {
  const Rainterpreter = (await (
    await ethers.getContractFactory("Rainterpreter")
  ).deploy()) as Rainterpreter;
  await Rainterpreter.deployed();

  return Rainterpreter;
}

async function deployRainterpreterStore() {
  const RainterpreterStore = (await (
    await ethers.getContractFactory("RainterpreterStore")
  ).deploy()) as RainterpreterStore;
  await RainterpreterStore.deployed();

  return RainterpreterStore;
}

async function deployRainterpreterExpressionDeployer(
  deployerConfig_: RainterpreterExpressionDeployerConstructionConfigStruct
) {
  const expressionDeployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployer"
  );

  const RainterpreterExpressionDeployer =
    (await expressionDeployerFactory.deploy(
      deployerConfig_
    )) as RainterpreterExpressionDeployer;

  await RainterpreterExpressionDeployer.deployed();

  return RainterpreterExpressionDeployer;
}
