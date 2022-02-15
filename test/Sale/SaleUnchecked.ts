import * as Util from "../Util";
import chai from "chai";
import { artifacts, ethers } from "hardhat";
import { concat } from "ethers/lib/utils";
import { op } from "../Util";
import type { Contract, ContractFactory } from "ethers";

import type { ConstructEvent, Sale } from "../../typechain/Sale";
import { ReserveToken } from "../../typechain/ReserveToken";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import {
  SaleConstructorConfigStruct,
  SaleFactory,
} from "../../typechain/SaleFactory";
import { Opcode } from "./SaleUtil";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { assert } = chai;

let reserve: ReserveToken & Contract,
  redeemableERC20FactoryFactory: ContractFactory,
  redeemableERC20Factory: RedeemableERC20Factory & Contract,
  readWriteTierFactory: ContractFactory,
  readWriteTier: ReadWriteTier & Contract,
  saleConstructorConfig: SaleConstructorConfigStruct,
  saleFactoryFactory: ContractFactory,
  saleFactory: SaleFactory & Contract,
  saleProxy: Sale & Contract,
  signers: SignerWithAddress[];

describe("SaleUnchecked", async function () {
  beforeEach(async () => {
    signers = await ethers.getSigners();

    reserve = (await Util.basicDeploy("ReserveToken", {})) as ReserveToken &
      Contract;
  });

  before(async () => {
    redeemableERC20FactoryFactory = await ethers.getContractFactory(
      "RedeemableERC20Factory",
      {}
    );
    redeemableERC20Factory =
      (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory &
        Contract;
    await redeemableERC20Factory.deployed();

    readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier &
      Contract;
    await readWriteTier.deployed();

    saleConstructorConfig = {
      redeemableERC20Factory: redeemableERC20Factory.address,
    };

    saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
    saleFactory = (await saleFactoryFactory.deploy(
      saleConstructorConfig
    )) as SaleFactory & Contract;
    await saleFactory.deployed();

    const { implementation, sender } = await Util.getEventArgs(
      saleFactory.deployTransaction,
      "Implementation",
      saleFactory
    );

    assert(sender === (await ethers.getSigners())[0].address, "wrong sender");

    saleProxy = new ethers.Contract(
      implementation,
      (await artifacts.readArtifact("Sale")).abi
    ) as Sale & Contract;

    const { sender: senderProxy, config } = (await Util.getEventArgs(
      saleFactory.deployTransaction,
      "Construct",
      saleProxy
    )) as ConstructEvent["args"];

    assert(senderProxy === saleFactory.address, "wrong proxy sender");

    assert(
      config.redeemableERC20Factory === redeemableERC20Factory.address,
      "wrong redeemableERC20Factory in SaleConstructorConfig"
    );
  });

  it("should panic when accumulator overflows with exponentiation op", async () => {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("Sale");

    const constants = [Util.max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(Opcode.VAL, 0);
    const vTwo = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.POW, 2)
    ]);

    const sale0 = (await saleFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as Sale & Contract;

    await Util.assertError(
      async () => await sale0.report(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("Sale");

    const constants = [Util.max_uint256.div(2), 3];

    const vHalfMaxUInt256 = op(Opcode.VAL, 0);
    const vThree = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    const sale0 = (await saleFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as Sale & Contract;

    await Util.assertError(
      async () => await sale0.report(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("Sale");

    const constants = [0, 1];

    const vZero = op(Opcode.VAL, 0);
    const vOne = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    const sale0 = (await saleFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as Sale & Contract;

    await Util.assertError(
      async () => await sale0.report(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    this.timeout(0);

    const saleFactory = await ethers.getContractFactory("Sale");

    const constants = [Util.max_uint256, 1];

    const vMaxUInt256 = op(Opcode.VAL, 0);
    const vOne = op(Opcode.VAL, 1);

    // prettier-ignore
    const source0 = concat([
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    const sale0 = (await saleFactory.deploy({
      sources: [source0],
      constants,
      argumentsLength: 0,
      stackLength: 10,
    })) as Sale & Contract;

    await Util.assertError(
      async () => await sale0.report(),
      "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)",
      "accumulator overflow did not panic"
    );
  });
});
