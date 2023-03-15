import { ethers } from "hardhat";
import deploy1820 from "../utils/deploy/registry1820/deploy";

import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

const main = async function () {
  const [signer] = await ethers.getSigners();

  // This will deploy the registry only if does not exist in the network (like localhost/hardhat)
  await deploy1820(signer);

  // Rainterpreter
  const interpreter = await rainterpreterDeploy();

  console.log("Rainterpreter deployed at: ", interpreter.address);

  // RainterpreterStore
  const store = await rainterpreterStoreDeploy();
  console.log("RainterpreterStore deployed at: ", store.address);

  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter,
    store
  );

  console.log("ExpressionDeployer deployed at: ", expressionDeployer.address);
};

main()
  .then(() => {
    const exit = process.exit;
    exit(0);
  })
  .catch((error) => {
    console.error(error);
    const exit = process.exit;
    exit(1);
  });
