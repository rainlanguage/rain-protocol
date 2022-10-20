import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AllStandardOpsTest,
  StandardIntegrity,
} from "../../../../typechain";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { numArrayToReport } from "../../../../utils/tier";

const Opcode = AllStandardOps;

describe("RainInterpreter tier report saturating diff op", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should use saturating sub for diff where only some tiers would underflow", async () => {
    const constants0 = [
      //         0x01000000020000000300000004000000050000000600000007
      numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
      // 0x0200000000000000040000000000000006000000000000000800000000
      numArrayToReport([2, 0, 4, 0, 6, 0, 8, 0].reverse()),
    ];

    const vReport0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vReport1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    const expectedResultHex0 =
      "0x01000000000000000300000000000000050000000000000007";

    assert(
      resultHex0 === expectedResultHex0,
      `wrong report diff
      expected  ${expectedResultHex0}
      got       ${resultHex0}`
    );
  });

  it("should use saturating sub for diff (does not panic when underflowing, but sets to zero)", async () => {
    const constants0 = [
      // 0x01000000020000000300000004000000050000000600000007
      numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
      // 0x0200000003000000040000000500000006000000070000000800000009
      numArrayToReport([2, 3, 4, 5, 6, 7, 8, 9].reverse()),
    ];

    const vReport0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vReport1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    assert(
      result0.isZero(),
      `wrong report diff
      expected  ${0x00}
      got       ${resultHex0}`
    );
  });

  it("should diff reports correctly", async () => {
    const constants0 = [
      // 0x0200000003000000040000000500000006000000070000000800000009
      numArrayToReport([2, 3, 4, 5, 6, 7, 8, 9].reverse()),
      // 0x01000000020000000300000004000000050000000600000007
      numArrayToReport([0, 1, 2, 3, 4, 5, 6, 7].reverse()),
    ];

    const vReport0 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const vReport1 = op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vReport0,
        vReport1,
      op(Opcode.SATURATING_DIFF),
    ]);

    await logic.initialize({ sources: [source0], constants: constants0 });

    await logic.run();
    const result0 = await logic.stackTop();
    const resultHex0 = hexlify(result0);

    const expectedResultHex0 =
      "0x0200000002000000020000000200000002000000020000000200000002";

    assert(
      resultHex0 === expectedResultHex0,
      `wrong report diff
      expected  ${expectedResultHex0}
      got       ${resultHex0}`
    );
  });
});
