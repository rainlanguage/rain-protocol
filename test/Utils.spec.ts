import * as Utils from "./Utils";
import chai from "chai";
const expect = chai.expect;
import { ethers } from "ethers";
import { array2BitUInts, array4BitUInts, wrap2BitUInt } from "./Utils";

describe("Utils Functions",function () {
  it("Should transform a hex number to a number block array",() => {
    const res = Utils.tierReport('123456');
    expect(res).to.have.lengthOf(8);
  });

  it("Throws an error if the number of blocks to report is not 8",() => {
    expect(() => {
      Utils.blockNumbersToReport([1,2,3,4,5,6,7])
    }).to.throw('AssertionError');
  });

  it("Return the number of blocks to report",() => {
    const res = Utils.blockNumbersToReport([1,2,3,4,5,6,7,8]);
    expect(res).to.have.lengthOf(64);
  });

  it("Should pad hex number to length of 32 bytes",() => {
    const bigNumber = ethers.BigNumber.from(
      "1234"
    );
    const res = Utils.zeroPad32(bigNumber);
    expect(res).to.have.lengthOf(66); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should pad hex number to length of 4 bytes",() => {
    const bigNumber = ethers.BigNumber.from(
      "1234"
    );
    const res = Utils.zeroPad4(bigNumber);
    expect(res).to.have.lengthOf(10); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should convert a value to a raw bytes representation",() => {
    const res = Utils.bytify(100);
    expect(res).to.have.lengthOf(1); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
    const res2 = Utils.bytify(22);
    expect(res2).to.have.lengthOf(1); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should construct an operand for RainVM's call opcode",() => {
    const res = Utils.callSize(1, 2, 3);
    expect(res).to.equal(113);
  });

  it("Should check for invalid fnSize",() => {
    expect(() => {
      Utils.callSize(8,2,3)
    }).to.throw('Invalid fnSize');
    expect(() => {
      Utils.callSize(-8,2,3)
    }).to.throw('Invalid fnSize');
  });

  it("Should check for invalid loopSize",() => {
    expect(() => {
      Utils.callSize(1,-1,3)
    }).to.throw('Invalid loopSize');

    expect(() => {
      Utils.callSize(1,4,3)
    }).to.throw('Invalid loopSize');
  });

  it("Should check for invalid valSize",() => {
    expect(() => {
      Utils.callSize(1,2,-1)
    }).to.throw('Invalid valSize');

    expect(() => {
      Utils.callSize(1,2,8)
    }).to.throw('Invalid valSize');
  });

  // todo I'm not quite sure what this is doing
  it("Should return arg",() => {
    const res = Utils.arg(3);
    expect(res).to.equal(131);
  });

  // todo I'm not quite sure what this is doing
  it("Should skip",() => {
    const res = Utils.skip(3, false);
    expect(res).to.equal(3);
    const res2 = Utils.skip(3, true);
    expect(res2).to.equal(131);
  });

  it("Should convert to an opcode and operand to bytes and return their concatenation",() => {
    const res = Utils.op(1, 2);
    expect(res).to.have.lengthOf(2);
    expect(res[0]).to.equal(1);
    expect(res[1]).to.equal(2);
  });

  it("Should wrap2BitUInt",() => {
    const res = Utils.wrap2BitUInt(3);
    expect(res).to.equal(3);

    // todo is this working correctly?
    const res2 = Utils.wrap2BitUInt(1000);
    expect(res2).to.equal(0);
  });

  it("Should wrap4BitUInt",() => {
    const res = Utils.wrap4BitUInt(3);
    expect(res).to.equal(3);

    const res2 = Utils.wrap4BitUInt(1000);
    expect(res2).to.equal(8);
  });

  it("Should wrap8BitUInt",() => {
    const res = Utils.wrap8BitUInt(3);
    expect(res).to.equal(3);

    const res2 = Utils.wrap8BitUInt(1000);
    expect(res2).to.equal(232);
  });

  it("Should array2BitUInts",() => {
    const res = Utils.array2BitUInts(3);
    expect(res).to.have.lengthOf(3);
  });

  // todo is this working correctly?
  it("Should array4BitUInts",() => {
    const res = Utils.array4BitUInts(3);
    expect(res).to.have.lengthOf(3);
  });

  // todo is this working correctly?
  it("Should array8BitUInts",() => {
    const res = Utils.array8BitUInts(3);
    expect(res).to.have.lengthOf(3);
  });

})