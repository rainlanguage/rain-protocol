import { assert } from "chai";
import { ethers } from "hardhat";
import type { CloneFactory, RedeemableERC20 } from "../../../typechain";
import { NewCloneEvent } from "../../../typechain/contracts/factory/CloneFactory";
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

  const cloneEvent = (await getEventArgs(
    redeemableERC20Clone,
    "NewClone",
    cloneFactory
  )) as NewCloneEvent["args"];

  assert(
    !(cloneEvent.clone === zeroAddress),
    "redeemableERC20 clone zero address"
  );

  const redeemableERC20 = (await ethers.getContractAt(
    "RedeemableERC20",
    cloneEvent.clone
  )) as RedeemableERC20;

  return redeemableERC20;
};
