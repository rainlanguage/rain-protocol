import { ethers } from "hardhat";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";

describe("Interpreter deployment flow", async function () {
  it("should deploy with the happy path", async function () {
    const [signer] = await ethers.getSigners();

    // This will deploy the registry only if does not exist in the network (like localhost/hardhat)
    await deploy1820(signer);

    const interpreter = await rainterpreterDeploy();
    const store = await rainterpreterStoreDeploy();

    const deployer = await rainterpreterExpressionDeployerDeploy(
      interpreter,
      store
    );

    console.log("ExpressionDeployer deployed at: ", deployer.address);
  });
});
