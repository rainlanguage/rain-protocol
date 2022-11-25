import { expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import { AllStandardOps, op } from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";

const Opcode = AllStandardOps;

describe("EXPLODE32 Opcode test", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should explode a single value into 8x 32 bit integers", async () => {
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.CONTEXT, 0x0000), // Initial Value
      op(Opcode.EXPLODE32),
    ]);

    await logic.initialize(
      {
        sources: [sourceMAIN],
        constants: [],
      },
      [8]
    );
    // 0
    await logic["runContext(uint256[][])"]([
      [
        ethers.BigNumber.from(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        ),
      ],
    ]);
    const result0 = await logic.stack();
    const expectedResult0 = [
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
    ];
    expect(result0).deep.equal(
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );

    // 1
    await logic["runContext(uint256[][])"]([
      [
        ethers.BigNumber.from(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        ),
      ],
    ]);
    const result1 = await logic.stack();
    const expectedResult1 = [
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0xffffffff"),
      ethers.BigNumber.from("0"),
    ];
    expect(result1).deep.equal(
      expectedResult1,
      `Invalid output, expected ${expectedResult1}, actual ${result1}`
    );

    // 2
    await logic["runContext(uint256[][])"]([[ethers.BigNumber.from("0x0")]]);
    const result2 = await logic.stack();
    const expectedResult2 = [
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
      ethers.BigNumber.from("0"),
    ];
    expect(result2).deep.equal(
      expectedResult2,
      `Invalid output, expected ${expectedResult2}, actual ${result2}`
    );
  });
});
