import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { LibInterpreterStateTest } from "../../../typechain";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";

describe("LibInterpreterState eval tests", async function () {
  let libInterpreterState: LibInterpreterStateTest;

  before(async () => {
    libInterpreterState = await libInterpreterStateDeploy();
  });

  it("should eval state for specified sourceIndex 1 when StackPointer is specified", async () => {
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
    const constants = [];

    const sourceIndex = 1;

    const { stackBottom_, stackTopAfter_ } =
      await libInterpreterState.callStatic[
        "evalStackPointer((bytes[],uint256[]),uint256,uint256[])"
      ]({ sources, constants }, sourceIndex, [1, 8]); // simply sets stackTop to stackBottom for ease of testing

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      `eval of sourceIndex 1 did not move stackTop up 32 * 8 bytes
      expected  ${stackBottom_.add(32 * 8)}
      got       ${stackTopAfter_}`
    );
  });

  it("should eval state for default sourceIndex 0 when StackPointer is specified", async () => {
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
    const constants = [];

    const { stackBottom_, stackTopAfter_ } =
      await libInterpreterState.callStatic[
        "evalStackPointer((bytes[],uint256[]),uint256[])"
      ]({ sources, constants }, [1, 8]); // simply sets stackTop to stackBottom for ease of testing

    assert(
      stackTopAfter_.eq(stackBottom_.add(32)),
      `eval of default sourceIndex 0 did not move stackTop up 32 bytes
      expected  ${stackBottom_.add(32)}
      got       ${stackTopAfter_}`
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
    const constants = [];

    const sourceIndex = 1;

    const { stackBottom_, stackTopAfter_ } =
      await libInterpreterState.callStatic[
        "eval((bytes[],uint256[]),uint256,uint256[])"
      ]({ sources, constants }, sourceIndex, [1, 8]);

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      `eval of sourceIndex 1 did not move stackTop up 32 * 8 bytes
      expected  ${stackBottom_.add(32 * 8)}
      got       ${stackTopAfter_}`
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
    const constants = [];

    const { stackBottom_, stackTopAfter_ } =
      await libInterpreterState.callStatic[
        "eval((bytes[],uint256[]),uint256[])"
      ](
        {
          sources,
          constants,
        },
        [8]
      );

    assert(
      stackTopAfter_.eq(stackBottom_.add(32 * 8)),
      `eval of sourceIndex 0 did not move stackTop up 32 * 8 bytes
      expected  ${stackBottom_.add(32 * 8)}
      got       ${stackTopAfter_}`
    );
  });

  it("should eval state for default sourceIndex 0 (BLOCK_NUMBER)", async () => {
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ])
    ];
    const constants = [];

    const { stackBottom_, stackTopAfter_ } =
      await libInterpreterState.callStatic[
        "eval((bytes[],uint256[]),uint256[])"
      ](
        {
          sources,
          constants,
        },
        [1]
      );

    assert(
      stackTopAfter_.eq(stackBottom_.add(32)),
      `eval of default sourceIndex 0 did not move stackTop up 32 bytes
      expected  ${stackBottom_.add(32)}
      got       ${stackTopAfter_}`
    );
  });
});
