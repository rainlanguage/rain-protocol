import { ethers } from "hardhat";
import deploy1820 from "../utils/deploy/registry1820/deploy";

import { getRainterpreterOpMetaBytes, keylessDeploy } from "../utils";

const main = async function () {
  const [signer] = await ethers.getSigners();

  // This will deploy the registry only if does not exist in the network (like localhost/hardhat)
  await deploy1820(signer);

  // Rainterpreter
  const interpreter = await keylessDeploy("Rainterpreter", signer);

  // RainterpreterStore
  const store = await keylessDeploy("RainterpreterStore", signer);

  // RainterpreterExpressionDeployer
  const bytes_ = getRainterpreterOpMetaBytes();

  const args = {
    interpreter: interpreter.address,
    store: store.address,
    opMeta: bytes_,
  };

  const expressionDeployer = await keylessDeploy(
    "RainterpreterExpressionDeployer",
    signer,
    args
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
