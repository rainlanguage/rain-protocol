import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { CombineTier } from "../../typechain/CombineTier";
import { concat, hexlify, zeroPad } from "ethers/lib/utils";
import { BigNumber } from "ethers/lib/ethers";

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
  it("should compile a basic program (store some numbers in val0 and val1)", async () => {
    this.timeout(0);

    const value0 = 255;
    const value1 = 256;

    const litVal0 = zeroPad(hexlify(BigNumber.from(value0)), 32);
    const litVal1 = zeroPad(hexlify(BigNumber.from(value1)), 32);

    const source = concat([
      hexlify(Opcode.LIT),
      litVal0,
      hexlify(Opcode.LIT),
      litVal1,
      hexlify(Opcode.END),
    ]);

    console.log(hexlify(source));

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    console.log(await getConstants(combineTier));

    const actualVal0 = await combineTier.val0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      expected  ${value0}
      got       ${actualVal0}`
    );
    const actualVal1 = await combineTier.val1();
    assert(
      actualVal1.eq(value1),
      `wrong val1
      expected  ${value1}
      got       ${actualVal1}`
    );
  });

  it("should compile a basic program (store a large number in val0)", async () => {
    this.timeout(0);

    const value0 = 123456789;

    const litVal0 = zeroPad(hexlify(BigNumber.from(value0)), 32);

    const source = concat([hexlify(Opcode.LIT), litVal0, hexlify(Opcode.END)]);

    console.log(hexlify(source));

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    console.log(await getConstants(combineTier));

    const actualVal0 = await combineTier.val0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      expected  ${value0}
      got       ${actualVal0}`
    );
  });

  it("should compile a basic program (store a small number in val0)", async () => {
    this.timeout(0);

    const value0 = 255;

    const litVal0 = zeroPad(hexlify(BigNumber.from(value0)), 32);

    const source = concat([hexlify(Opcode.LIT), litVal0, hexlify(Opcode.END)]);

    console.log(hexlify(source));

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    console.log(await getConstants(combineTier));

    const actualVal0 = await combineTier.val0();
    assert(
      actualVal0.eq(value0),
      `wrong val0
      expected  ${value0}
      got       ${actualVal0}`
    );
  });

  it("should make constants publically available on construction", async () => {
    this.timeout(0);

    const source = new Uint8Array([]);

    const combineTierFactory = await ethers.getContractFactory("CombineTier");
    const combineTier = (await combineTierFactory.deploy(
      source
    )) as CombineTier;

    console.log(await getConstants(combineTier));
  });
});

const getConstants = async (combineTier: CombineTier) => `Constants:
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
