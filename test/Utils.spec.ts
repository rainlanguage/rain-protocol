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
    );    const res = Utils.zeroPad32(bigNumber);
    expect(res).to.have.lengthOf(66); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

  it("Should pad hex number to length of 4 bytes", async () => {
    const bigNumber = ethers.BigNumber.from(
      "1234"
    );    const res = Utils.zeroPad4(bigNumber);
    expect(res).to.have.lengthOf(10); // todo consider replacing with `chai-bytes`: usage: expect(buffer).to.equalBytes('0102030405');
  });

})