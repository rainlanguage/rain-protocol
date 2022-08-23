import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";

describe("LibVMState eval tests", async function () {
  let libStackTop: LibVMStateTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibVMStateTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibVMStateTest;
  });

  it("should eval state for specified sourceIndex 1 when StackTop is specified", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ]),
      concat([ // sourceIndex 1
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];
    const sourceIndex = 1;

    const { stackBottom_, stackTopAfter_ } = await libStackTop.callStatic[
      "evalStackTop(bytes[],uint256)"
    ](sources, sourceIndex); // simply sets stackTop to stackBottom for ease of testing

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      "eval of sourceIndex 1 did not move stackTop up 32 * 8 bytes"
    );
  });

  it("should eval state for default sourceIndex 0 when StackTop is specified", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ]),
      concat([ // sourceIndex 1
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];

    const { stackBottom_, stackTopAfter_ } = await libStackTop.callStatic[
      "evalStackTop(bytes[])"
    ](sources); // simply sets stackTop to stackBottom for ease of testing

    assert(
      stackTopAfter_.eq(stackBottom_.add(32)),
      "eval of default sourceIndex 0 did not move stackTop up 32 bytes"
    );
  });

  it("should eval state for specified sourceIndex 1", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ]),
      concat([ // sourceIndex 1
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];

    const sourceIndex = 1;

    const { stackBottom_, stackTopAfter_ } = await libStackTop.callStatic[
      "eval(bytes[],uint256)"
    ](sources, sourceIndex);

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      "eval of sourceIndex 1 did not move stackTop up 32 * 8 bytes"
    );
  });

  it("should eval state for default sourceIndex 0 (EXPLODE32(BLOCK_NUMBER))", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];

    const { stackBottom_, stackTopAfter_ } = await libStackTop.callStatic[
      "eval(bytes[])"
    ](sources);

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      "eval of sourceIndex 0 did not move stackTop up 32 * 8 bytes"
    );
  });

  it("should eval state for default sourceIndex 0 (BLOCK_NUMBER)", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ])
    ];

    const { stackBottom_, stackTopAfter_ } = await libStackTop.callStatic[
      "eval(bytes[])"
    ](sources);

    assert(
      stackTopAfter_.eq(stackBottom_.add(32)),
      "eval of default sourceIndex 0 did not move stackTop up 32 bytes"
    );
  });
});
