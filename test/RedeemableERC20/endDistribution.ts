import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  ERC20PulleeTest,
  ReadWriteTier,
  ReserveToken,
} from "../../typechain";
import * as Util from "../../utils";
import { readWriteTierDeploy, Tier } from "../../utils";
import { erc20PulleeDeploy } from "../../utils/deploy/test/erc20Pullee/deploy";
import { reserveDeploy } from "../../utils/deploy/test/reserve/deploy";
import { Phase } from "../../utils/types/redeemableERC20";

describe("RedeemableERC20 endDistribution test", async function () {
  let erc20Pullee: ERC20PulleeTest;
  let tier: ReadWriteTier;
  let reserve: ReserveToken;

  before(async () => {
    erc20Pullee = await erc20PulleeDeploy();
    tier = await readWriteTierDeploy();
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should only allow sender with DISTRIBUTOR_BURNER role to call endDistribution", async function () {
    const signers = await ethers.getSigners();

    const minimumTier = Tier.FOUR;

    const totalSupply = ethers.BigNumber.from("5000" + Util.eighteenZeros);
    const redeemableERC20Config = {
      name: "RedeemableERC20",
      symbol: "RDX",
      distributor: erc20Pullee.address,
      initialSupply: totalSupply,
    };

    const redeemableERC20 = await Util.redeemableERC20Deploy(signers[0], {
      reserve: reserve.address,
      erc20Config: redeemableERC20Config,
      tier: tier.address,
      minimumTier: minimumTier,
      distributionEndForwardingAddress: ethers.constants.AddressZero,
    });

    assert(
      (await redeemableERC20.currentPhase()).eq(Phase.DISTRIBUTING),
      `default phase was not phase ONE, got ${await redeemableERC20.currentPhase()}`
    );

    await Util.assertError(
      async () =>
        await redeemableERC20
          .connect(signers[1])
          .endDistribution(signers[0].address),
      "ONLY_ADMIN",
      "was wrongly able to set phase block with insuffient role permissions"
    );

    await erc20Pullee.endDistribution(redeemableERC20.address, Util.oneAddress);
  });
});
