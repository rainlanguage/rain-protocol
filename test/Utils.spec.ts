import * as Utils from "./Utils";
import chai from "chai";
const expect = chai.expect;
import { ethers } from "ethers";

describe("Utils Functions", async function () {
  it("Should transform a hex number to a number block array", async () => {
    const res = Utils.tierReport('123456');
    expect(res).to.have.lengthOf(8);
  });

  it("Throws an error if the number of blocks to report is not 8", async () => {
    expect(() => {
      Utils.blockNumbersToReport([1,2,3,4,5,6,7])
    }).to.throw('AssertionError');
  });

  it("Return the number of blocks to report", async () => {
    const res = Utils.blockNumbersToReport([1,2,3,4,5,6,7,8]);
    expect(res).to.have.lengthOf(64);
  });

  it("Should pad hex number to length of 32 bytes", async () => {
    const bigNumber = ethers.BigNumber.from(
      "1234"
    );
    const res = Utils.zeroPad32(bigNumber);
    expect(res).to.have.lengthOf(66); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should pad hex number to length of 4 bytes", async () => {
    const bigNumber = ethers.BigNumber.from(
      "1234"
    );
    const res = Utils.zeroPad4(bigNumber);
    expect(res).to.have.lengthOf(10); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should convert a value to a raw bytes representation", async () => {
    const res = Utils.bytify(100);
    expect(res).to.have.lengthOf(1); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
    const res2 = Utils.bytify(22);
    expect(res2).to.have.lengthOf(1); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should construct an operand for RainVM's call opcode", async () => {
    const res = Utils.callSize(1, 2, 3);
    expect(res).to.equal(113);
  });

  it("Should check for invalid fnSize", async () => {
    expect(() => {
      Utils.callSize(8,2,3)
    }).to.throw('Invalid fnSize');
    expect(() => {
      Utils.callSize(-8,2,3)
    }).to.throw('Invalid fnSize');
  });

  it("Should check for invalid loopSize", async () => {
    expect(() => {
      Utils.callSize(1,-1,3)
    }).to.throw('Invalid loopSize');

    expect(() => {
      Utils.callSize(1,4,3)
    }).to.throw('Invalid loopSize');
  });

  it("Should check for invalid valSize", async () => {
    expect(() => {
      Utils.callSize(1,2,-1)
    }).to.throw('Invalid valSize');

    expect(() => {
      Utils.callSize(1,2,8)
    }).to.throw('Invalid valSize');
  });



})