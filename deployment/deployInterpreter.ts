import { ethers, network } from "hardhat";
import deploy1820 from "../utils/deploy/registryErc1820/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

const main = async function () {
  const [signer] = await ethers.getSigners();

  // This will deploy the registry only if does not exist in the network (like localhost/hardhat)
  await deploy1820(signer);

  console.log("here: ", network.name);

  const interpreter = await rainterpreterDeploy();
  const store = await rainterpreterStoreDeploy();

  const deployer = await rainterpreterExpressionDeployerDeploy(
    interpreter,
    store
  );

  console.log("ExpressionDeployer deployed at: ", deployer.address);
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
