import type {
  RedeemableERC20,
  RedeemableERC20ConfigStruct,
} from "../../typechain/RedeemableERC20";
import type {
  ImplementationEvent as ImplementationEventRedeemableERC20Factory,
  RedeemableERC20Factory,
} from "../../typechain/RedeemableERC20Factory";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";
import { zeroAddress } from "../constants";
import { Contract } from "ethers";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
const { assert } = chai;

export const redeemableERC20Deploy = async (
  deployer: SignerWithAddress,
  config: RedeemableERC20ConfigStruct
) => {
  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory"
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();

  const { implementation } = (await getEventArgs(
    redeemableERC20Factory.deployTransaction,
    "Implementation",
    redeemableERC20Factory
  )) as ImplementationEventRedeemableERC20Factory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation redeemableERC20 factory zero address"
  );

  const txDeploy = await redeemableERC20Factory.createChildTyped(config);
  const redeemableERC20 = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", redeemableERC20Factory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("RedeemableERC20")).abi,
    deployer
  ) as RedeemableERC20 & Contract;

  await redeemableERC20.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  redeemableERC20.deployTransaction = txDeploy;

  return redeemableERC20;
};
