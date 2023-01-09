import { assert } from "chai";
import { ethers } from "hardhat";
import {
  Rainterpreter,
  RainterpreterExpressionDeployer,
  ReserveToken18,
  StakeFactory,
} from "../../typechain";
import { StakeConfigStruct } from "../../typechain/contracts/stake/Stake";
import {
  getEventArgs,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
} from "../../utils";
import { max_uint256 } from "../../utils/constants/bigNumber";
import { basicDeploy } from "../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { stakeDeploy } from "../../utils/deploy/stake/deploy";
import { stakeFactoryDeploy } from "../../utils/deploy/stake/stakeFactory/deploy";

describe("Stake maxRedeem", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken18;
  let interpreter: Rainterpreter;
  let expressionDeployer: RainterpreterExpressionDeployer;

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
    interpreter = await rainterpreterDeploy();
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await token.initialize();
  });

  it("maxRedeem should respect maxWithdraw but as shares rounded up (calculating the amount of underlying tokens a user has to provide to receive a certain amount of shares, it should round up)", async function () {
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

    const constants = [max_uint256, max_uint256];

    const max_deposit = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const max_withdraw = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    const source = [max_deposit, max_withdraw];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      stateConfig: {
        sources: source,
        constants: constants,
      },
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

    const maxRedeem_ = await stake.maxRedeem(alice.address);

    console.log({ maxRedeem_ });

    const tokenBalanceAlice1 = await token.balanceOf(alice.address);

    const redeemTx_ = await stake
      .connect(alice)
      .redeem(3, alice.address, alice.address);

    const tokenBalanceAlice2 = await token.balanceOf(alice.address);

    const { sender, receiver, owner, assets, shares } = await getEventArgs(
      redeemTx_,
      "Withdraw",
      stake
    );

    console.log({ sender, receiver, owner, assets, shares });

    assert(tokenBalanceAlice1.isZero());
    assert(
      tokenBalanceAlice2.eq(3),
      `did not favour vault when redeeming assets
      expected  3
      got       ${tokenBalanceAlice2}`
    );
  });
});
