import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { CombineTier } from "../../typechain/CombineTier";
import { hexlify } from "ethers/lib/utils";

chai.use(solidity);
const { expect, assert } = chai;

const enum Opcode {
  END,
  LIT,
  ARG,
  VAL,
  CALL,
  BLOCK_NUMBER,
  ACCOUNT,
  REPORT,
  AND_OLD,
  AND_NEW,
  AND_LEFT,
  OR_OLD,
  OR_NEW,
  OR_LEFT,
}

describe("CombineTier", async function () {
  it("should compile a basic program (store some number in val0)", async () => {
    this.timeout(0);

    const source = hexlify(Opcode.END);

    console.log(source);

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    console.log(`constants
    MAX_COMPILED_SOURCE_LENGTH  ${await combineTier.MAX_COMPILED_SOURCE_LENGTH()}
    LIT_SIZE_BYTES              ${await combineTier.LIT_SIZE_BYTES()}

    OPCODE_END                  ${await combineTier.OPCODE_END()}
    OPCODE_LIT                  ${await combineTier.OPCODE_LIT()}
    OPCODE_ARG                  ${await combineTier.OPCODE_ARG()}

    OPCODE_VAL                  ${await combineTier.OPCODE_VAL()}
    OPCODE_CALL                 ${await combineTier.OPCODE_CALL()}

    OPCODE_BLOCK_NUMBER         ${await combineTier.OPCODE_BLOCK_NUMBER()}

    OPCODE_RESERVED_MAX         ${await combineTier.OPCODE_RESERVED_MAX()}

    OPCODE_ACCOUNT              ${await combineTier.OPCODE_ACCOUNT()}
    OPCODE_REPORT               ${await combineTier.OPCODE_REPORT()}

    OPCODE_AND_OLD              ${await combineTier.OPCODE_AND_OLD()}
    OPCODE_AND_NEW              ${await combineTier.OPCODE_AND_NEW()}
    OPCODE_AND_LEFT             ${await combineTier.OPCODE_AND_LEFT()}
    OPCODE_OR_OLD               ${await combineTier.OPCODE_OR_OLD()}
    OPCODE_OR_NEW               ${await combineTier.OPCODE_OR_NEW()}
    OPCODE_OR_LEFT              ${await combineTier.OPCODE_OR_LEFT()}

    val0                        ${await combineTier.val0()}
    val1                        ${await combineTier.val1()}
    val2                        ${await combineTier.val2()}
    val3                        ${await combineTier.val3()}
    val4                        ${await combineTier.val4()}
    val5                        ${await combineTier.val5()}
    val6                        ${await combineTier.val6()}
    val7                        ${await combineTier.val7()}
    val8                        ${await combineTier.val8()}
    val9                        ${await combineTier.val9()}
    val10                       ${await combineTier.val10()}
    val11                       ${await combineTier.val11()}
    val12                       ${await combineTier.val12()}

    source0                     ${await combineTier.source0()}
    source1                     ${await combineTier.source1()}
    source2                     ${await combineTier.source2()}
    source3                     ${await combineTier.source3()}`);
  });

  it("should make constants publically available on construction", async () => {
    this.timeout(0);

    const source = new Uint8Array([]);

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    // console.log(
    `constants
    MAX_COMPILED_SOURCE_LENGTH  ${await combineTier.MAX_COMPILED_SOURCE_LENGTH()}
    LIT_SIZE_BYTES              ${await combineTier.LIT_SIZE_BYTES()}

    OPCODE_END                  ${await combineTier.OPCODE_END()}
    OPCODE_LIT                  ${await combineTier.OPCODE_LIT()}
    OPCODE_ARG                  ${await combineTier.OPCODE_ARG()}

    OPCODE_VAL                  ${await combineTier.OPCODE_VAL()}
    OPCODE_CALL                 ${await combineTier.OPCODE_CALL()}

    OPCODE_BLOCK_NUMBER         ${await combineTier.OPCODE_BLOCK_NUMBER()}

    OPCODE_RESERVED_MAX         ${await combineTier.OPCODE_RESERVED_MAX()}

    OPCODE_ACCOUNT              ${await combineTier.OPCODE_ACCOUNT()}
    OPCODE_REPORT               ${await combineTier.OPCODE_REPORT()}

    OPCODE_AND_OLD              ${await combineTier.OPCODE_AND_OLD()}
    OPCODE_AND_NEW              ${await combineTier.OPCODE_AND_NEW()}
    OPCODE_AND_LEFT             ${await combineTier.OPCODE_AND_LEFT()}
    OPCODE_OR_OLD               ${await combineTier.OPCODE_OR_OLD()}
    OPCODE_OR_NEW               ${await combineTier.OPCODE_OR_NEW()}
    OPCODE_OR_LEFT              ${await combineTier.OPCODE_OR_LEFT()}

    val0                        ${await combineTier.val0()}
    val1                        ${await combineTier.val1()}
    val2                        ${await combineTier.val2()}
    val3                        ${await combineTier.val3()}
    val4                        ${await combineTier.val4()}
    val5                        ${await combineTier.val5()}
    val6                        ${await combineTier.val6()}
    val7                        ${await combineTier.val7()}
    val8                        ${await combineTier.val8()}
    val9                        ${await combineTier.val9()}
    val10                       ${await combineTier.val10()}
    val11                       ${await combineTier.val11()}
    val12                       ${await combineTier.val12()}

    source0                     ${await combineTier.source0()}
    source1                     ${await combineTier.source1()}
    source2                     ${await combineTier.source2()}
    source3                     ${await combineTier.source3()}`;
    //)
  });
});
