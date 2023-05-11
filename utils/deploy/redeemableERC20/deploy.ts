import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { strict as assert } from "assert";
import { artifacts, ethers } from "hardhat";
import type { CloneFactory, RedeemableERC20 } from "../../../typechain";

import { RedeemableERC20ConfigStruct } from "../../../typechain/contracts/redeemableERC20/RedeemableERC20";

import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";

export const redeemableERC20DeployImplementation =
  async (): Promise<RedeemableERC20> => {
    const redeemableERC20Factory = await ethers.getContractFactory(
      "RedeemableERC20",
      {}
    );

    const redeemableERC20 =
      (await redeemableERC20Factory.deploy()) as RedeemableERC20;
    await redeemableERC20.deployed();

    assert(
      !(redeemableERC20.address === zeroAddress),
      "implementation redeemableERC20 zero address"
    );

    return redeemableERC20;
  };

export const redeemableERC20DeployClone = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: RedeemableERC20,
  initialConfig: RedeemableERC20ConfigStruct
) => {
  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(address reserve ,tuple(string name,string symbol,address distributor,uint256 initialSupply) erc20Config , address tier , uint256 minimumTier, address distributionEndForwardingAddress)",
    ],
    [initialConfig]
  );

  const redeemableERC20Clone = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const redeemableERC20 = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(redeemableERC20Clone, "NewClone", cloneFactory))
          .clone
      ),
      20
    ),
    (await artifacts.readArtifact("RedeemableERC20")).abi,
    deployer
  ) as RedeemableERC20;

  await redeemableERC20.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore

  redeemableERC20.deployTransaction = redeemableERC20Clone;
  return redeemableERC20;
};
