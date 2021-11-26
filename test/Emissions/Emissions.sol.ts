import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { concat } from "ethers/lib/utils";

import type { Contract } from "ethers";
import type { Emissions } from "../../typechain/Emissions";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

const enum Opcode {
  END,
  VAL,
  CALL,
  BLOCK_NUMBER,
}

describe("Emissions", async function () {
  it("should have the correct opcodes", async () => {
    this.timeout(0);

    const vals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const source = [0, 0, 0, 0];

    const emissionFactory = await ethers.getContractFactory("Emissions");
    const emission = (await emissionFactory.deploy({
      source,
      vals,
    })) as Emissions & Contract;

    assert((await emission.OPCODE_END()) === Opcode.END);
    assert((await emission.OPCODE_VAL()) === Opcode.VAL);
    assert((await emission.OPCODE_CALL()) === Opcode.CALL);
    assert((await emission.opcodeBlockNumber()) === Opcode.BLOCK_NUMBER);
  });
});
