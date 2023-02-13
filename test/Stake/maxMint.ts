import { assert } from "chai";
import { ethers } from "hardhat";
import { ReserveToken18, StakeFactory } from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import {
  assertError,
  generateEvaluableConfig,
  getEventArgs,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../../utils";
import { max_uint256 } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";

describe("Stake maxMint", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    stakeFactory = await stakeFactoryDeploy();
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("maxMint should respect maxDeposit but as shares rounded down (calculating the amount of the underlying tokens to transfer to them for returning a certain amount of shares, it should round down.)", async function () {
    /**
     * Note that, in this scenario, rounding is involved in the calculation of shares in the following expression within the ERC4626 implementation:
     *
     * assets.mulDiv(supply, totalAssets(), rounding);
     *
     * Where
     * - `assets` is the maxWithdraw value
     * - `supply` is total supply of shares
     * - `totalAssets()` is the total supply of the underlying token
     * - `rounding` determines whether to round up or down
     *
     * Redemptions and minted shares should favour the vault so that the contract cannot be drained by repeatedly swapping tokens. This does mean that there may be dust leftover on the contract.
     *
     */

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[1];
    const bob = signers[2];

    const constants = [max_uint256, max_uint256];

    const max_deposit = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.read_memory,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];
    const evaluableConfig = await generateEvaluableConfig(source, constants);
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice some reserve tokens and deposit them
    await token.transfer(alice.address, 9);
    const tokenBalanceAlice0 = await token.balanceOf(alice.address);
    await token.connect(alice).approve(stake.address, tokenBalanceAlice0);
    await stake.connect(alice).deposit(tokenBalanceAlice0, alice.address);

    // anon attempts to grief contract
    await token.transfer(stake.address, 1);

    const shares_ = await stake.totalSupply(); // 9
    const assets_ = await stake.totalAssets(); // 10 (excess assets)

    console.log({ shares_, assets_ });

    const maxMint_ = await stake.maxMint(alice.address);

    console.log({ maxMint_ });

    // Give Bob some reserve tokens and mint a specific number of shares
    await token.transfer(bob.address, 3);
    const tokenBalanceBob1 = await token.balanceOf(bob.address);
    const sharesBalanceBob1 = await stake.balanceOf(bob.address);
    await token.connect(bob).approve(stake.address, tokenBalanceBob1);

    await assertError(
      async () => await stake.connect(bob).mint(3, bob.address),
      "ERC20: insufficient allowance",
      "wrongly minted shares, did not favour vault"
    );

    // Bob needs one more token because we favour the vault
    await token.transfer(bob.address, 1);
    const tokenBalanceBob2 = await token.balanceOf(bob.address);
    assert(tokenBalanceBob2.eq(4));

    await token.connect(bob).approve(stake.address, tokenBalanceBob2);

    const mintTx_ = await stake.connect(bob).mint(3, bob.address);

    const tokenBalanceBob3 = await token.balanceOf(bob.address);
    const sharesBalanceBob3 = await stake.balanceOf(bob.address);

    const { sender, owner, assets, shares } = await getEventArgs(
      mintTx_,
      "Deposit",
      stake
    );

    console.log({ sender, owner, assets, shares });

    assert(tokenBalanceBob3.isZero());

    assert(sharesBalanceBob1.isZero());
    assert(
      sharesBalanceBob3.eq(3),
      `did not favour vault when minting shares
      expected  3
      got       ${sharesBalanceBob3}`
    );
  });
});
