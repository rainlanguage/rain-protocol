import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { Contract } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { ReserveToken } from "../../../../typechain/ReserveToken";
import { basicDeploy } from "../../../../utils/deploy/basic";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20: ReserveToken;

describe("RainVM ERC20 ops", async function () {
  let stateBuilder: AllStandardOpsStateBuilder & Contract;
  let logic: AllStandardOpsTest & Contract;

  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder &
        Contract;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest & Contract;
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
    signer1 = signers[1];

    tokenERC20 = (await basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  it("should return ERC20 total supply", async () => {
    this.timeout(0);

    const constants = [tokenERC20.address];
    const vTokenAddr = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
        op(Opcode.ERC20_TOTAL_SUPPLY)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await logic.run();
    const result0 = await logic.stackTop();
    const totalTokenSupply = await tokenERC20.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance", async () => {
    this.timeout(0);

    const constants = [signer1.address, tokenERC20.address];
    const vSigner1 = op(Opcode.CONSTANT, 0);
    const vTokenAddr = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
        op(Opcode.ERC20_BALANCE_OF)
      ]),
    ];

    await logic.initialize({ sources, constants });
    await logic.run();
    const result0 = await logic.stackTop();
    assert(result0.isZero(), `expected 0, got ${result0}`);

    await tokenERC20.transfer(signer1.address, 100);

    await logic.run();
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
