import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { RedeemableERC20 } from "../../../typechain";
import { RedeemableERC20ConfigStruct } from "../../../typechain/contracts/redeemableERC20/RedeemableERC20";
import { ImplementationEvent as ImplementationEventRedeemableERC20Factory } from "../../../typechain/contracts/redeemableERC20/RedeemableERC20Factory";
import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";
import { redeemableERC20FactoryDeploy } from "./redeemableERC20Factory/deploy";

export const redeemableERC20Deploy = async (
  deployer: SignerWithAddress,
  config: RedeemableERC20ConfigStruct
) => {
  const redeemableERC20Factory = await redeemableERC20FactoryDeploy();

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
  ) as RedeemableERC20;

  await redeemableERC20.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  redeemableERC20.deployTransaction = txDeploy;

  return redeemableERC20;
};
