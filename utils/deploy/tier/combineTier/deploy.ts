import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { CombineTier, CombineTierFactory } from "../../../../typechain";
import { CombineTierConfigStruct } from "../../../../typechain/contracts/tier/CombineTier";
import { ImplementationEvent as ImplementationEventCombineTierFactory } from "../../../../typechain/contracts/tier/CombineTierFactory";
import { zeroAddress } from "../../../constants";
import { getEventArgs } from "../../../events";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const combineTierDeploy = async (
  deployer: SignerWithAddress,
  config: CombineTierConfigStruct
) => {
  let interpreter = config.interpreter;
  let expressionDeployer = config.expressionDeployer;
  if (interpreter === "" || expressionDeployer === "") {
    const rainterpreter = await rainterpreterDeploy();
    interpreter = rainterpreter.address;
    expressionDeployer = (
      await rainterpreterExpressionDeployerDeploy(rainterpreter)
    ).address;
  }

  config = {
    ...config,
    interpreter,
    expressionDeployer,
  };

  const combineTierFactoryFactory = await ethers.getContractFactory(
    "CombineTierFactory"
  );
  const combineTierFactory =
    (await combineTierFactoryFactory.deploy()) as CombineTierFactory;
  await combineTierFactory.deployed();

  const { implementation } = (await getEventArgs(
    combineTierFactory.deployTransaction,
    "Implementation",
    combineTierFactory
  )) as ImplementationEventCombineTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation combineTier factory zero address"
  );

  const tx = await combineTierFactory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", combineTierFactory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("CombineTier")).abi,
    deployer
  ) as CombineTier;
  await contract.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  contract.deployTransaction = tx;

  return contract;
};
