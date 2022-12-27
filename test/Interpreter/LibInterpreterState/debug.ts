import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type {
  LibInterpreterStateTest,
  Rainterpreter,
} from "../../../typechain";
import { rainterpreterDeploy } from "../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { libInterpreterStateDeploy } from "../../../utils/deploy/test/libInterpreterState/deploy";
import { op } from "../../../utils/interpreter/interpreter";
import { Opcode } from "../../../utils/interpreter/ops/allStandardOps";

export enum DebugStyle {
  Stack,
  Constant,
  Context,
  Source,
}

describe("LibInterpreterState debug tests", async function () {
  let rainInterpreter: Rainterpreter;
  let libInterpreterState: LibInterpreterStateTest;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    libInterpreterState = await libInterpreterStateDeploy();
  });

  it.only("should debug Stack", async () => {
    const debugStyle = DebugStyle.Stack;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ]),
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
        op(Opcode.CONTEXT, 0x0000), // sender
        op(Opcode.CONTEXT, 0x0001), // this address
        op(Opcode.BLOCK_TIMESTAMP, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [[3, 5, 7, 9, 11]];
    const sourceIndex = 1;
    const maxStackLength = 255;
    console.log("Begin Stack debug logs");

    const { stackTop_, stackTopAfter_ } = await libInterpreterState.debug(
      rainInterpreter.address,
      { sources, constants },
      context,
      debugStyle,
      sourceIndex,
      maxStackLength
    );

    console.log("End Stack debug logs");

    assert(stackTopAfter_.eq(stackTop_));
  });

  it("should debug Constants", async () => {
    const debugStyle = DebugStyle.Constant;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [[3, 5, 7, 9, 11]];
    const sourceIndex = 0;

    console.log({ constants });

    console.log("Begin Constants debug logs");

    const { stackTop_, stackTopAfter_ } =
      await libInterpreterState.callStatic.debug(
        { sources, constants },
        context,
        debugStyle,
        sourceIndex,
        [1]
      );

    console.log("End Constants debug logs");

    assert(stackTopAfter_.eq(stackTop_));
  });

  it("should debug Context", async () => {
    const debugStyle = DebugStyle.Context;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [[3, 5, 7, 9, 11]];
    const sourceIndex = 0;

    console.log({ context });

    console.log("Begin Context debug logs");

    const { stackTop_, stackTopAfter_ } =
      await libInterpreterState.callStatic.debug(
        { sources, constants },
        context,
        debugStyle,
        sourceIndex,
        [1]
      );

    console.log("End Context debug logs");

    assert(stackTopAfter_.eq(stackTop_));
  });

  it("should debug Source", async () => {
    const debugStyle = DebugStyle.Source;
    // prettier-ignore
    const sources = [
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
      ]),
      concat([
        op(Opcode.BLOCK_NUMBER, 0),
        op(Opcode.CONTEXT, 0x0000), // sender
        op(Opcode.CONTEXT, 0x0001), // this address
        op(Opcode.BLOCK_TIMESTAMP, 0),
      ])
    ];
    const constants = [2, 4, 6, 8, 10];
    const context = [[3, 5, 7, 9, 11]];
    const sourceIndex = 0;

    const serialized_ = await libInterpreterState.callStatic.serialize(
      {
        sources,
        constants,
      },
      [1, 1]
    );

    console.log({ serialized_ });

    console.log("Begin Source debug logs");

    const { stackTop_, stackTopAfter_ } =
      await libInterpreterState.callStatic.debug(
        { sources, constants },
        context,
        debugStyle,
        sourceIndex,
        [1, 1]
      );

    console.log("End Source debug logs");

    assert(stackTopAfter_.eq(stackTop_));
  });
});
