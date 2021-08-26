import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";

chai.use(solidity);
const { expect, assert } = chai;

const APPROVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("APPROVER_ADMIN")
);
const APPROVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("APPROVER"));
const REMOVER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("REMOVER_ADMIN")
);
const REMOVER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("REMOVER"));
const BANNER_ADMIN = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes("BANNER_ADMIN")
);
const BANNER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BANNER"));

let kycFactory;

describe("KYC", async function () {
  before(async () => {
    kycFactory = await ethers.getContractFactory("KYC");
  });

  it("should hold correct public constants", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const kyc = await kycFactory.deploy(admin.address);

    assert(
      (await kyc.APPROVER_ADMIN()) === APPROVER_ADMIN,
      "wrong APPROVER_ADMIN hash value"
    );
    assert((await kyc.APPROVER()) === APPROVER, "wrong APPROVER hash value");

    assert(
      (await kyc.REMOVER_ADMIN()) === REMOVER_ADMIN,
      "wrong REMOVER_ADMIN hash value"
    );
    assert((await kyc.REMOVER()) === REMOVER, "wrong REMOVER hash value");

    assert(
      (await kyc.BANNER_ADMIN()) === BANNER_ADMIN,
      "wrong BANNER_ADMIN hash value"
    );
    assert((await kyc.BANNER()) === BANNER, "wrong BANNER hash value");
  });

  it("should correctly set up access control roles for admin in constructor", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const kyc = await kycFactory.deploy(admin.address);

    // admin (specified in constructor) has all roles
    assert(
      await kyc.hasRole(APPROVER_ADMIN, admin.address),
      "admin did not have APPROVER_ADMIN role after construction"
    );
    assert(
      await kyc.hasRole(REMOVER_ADMIN, admin.address),
      "admin did not have REMOVER_ADMIN role after construction"
    );
    assert(
      await kyc.hasRole(BANNER_ADMIN, admin.address),
      "admin did not have BANNER_ADMIN role after construction"
    );
  });

  it("should allow anyone to map their account to a KYC session id", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const kyc = await kycFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    const SESSION_ID1 = ethers.BigNumber.from("12345678901234567901");

    // signer1 generates KYC session id
    await expect(kyc.connect(signer1).add(SESSION_ID0))
      .to.emit(kyc, "Add")
      .withArgs(signer1.address, SESSION_ID0);

    // check that signer1 is mapped to KYC session
    assert(
      (await kyc.ids(signer1.address)).eq(SESSION_ID0),
      "signer1 was not mapped to KYC session after adding"
    );

    // prevent creating new KYC session id if one exists
    await Util.assertError(
      async () => {
        await kyc.connect(signer1).add(SESSION_ID1);
      },
      "revert SESSION_EXISTS",
      "created new KYC for signer1 despite one existing"
    );
  });

  it("should allow admin to approve KYC sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const kyc = await kycFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates KYC session id
    await kyc.connect(signer1).add(SESSION_ID0);

    // approve KYC session
    await expect(kyc.approve(SESSION_ID0))
      .to.emit(kyc, "Approve")
      .withArgs(SESSION_ID0);
  });

  it("should allow admin to remove accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const kyc = await kycFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates KYC session id
    await kyc.connect(signer1).add(SESSION_ID0);

    // admin removes account
    await expect(kyc.remove(signer1.address))
      .to.emit(kyc, "Remove")
      .withArgs(signer1.address);

    // check that signer1 has been deleted
    assert(
      (await kyc.ids(signer1.address)).isZero(),
      "failed to remove address from KYC session map"
    );
  });

  it("should allow admin to ban KYC sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const kyc = await kycFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates KYC session id
    await kyc.connect(signer1).add(SESSION_ID0);

    // admin bans KYC session
    await expect(kyc.ban(SESSION_ID0))
      .to.emit(kyc, "Ban")
      .withArgs(SESSION_ID0);
  });

  it("should track how many blocks since KYC session was approved", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const kyc = await kycFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates KYC session id
    await kyc.connect(signer1).add(SESSION_ID0);

    const startBlock = await ethers.provider.getBlockNumber();

    await kyc.approve(SESSION_ID0);

    const actualApprovedSinceBlock0 = await kyc.accountApprovedSince(
      signer1.address
    );
    const expectedApprovedSinceBlock0 = startBlock + 1;

    assert(
      actualApprovedSinceBlock0.eq(expectedApprovedSinceBlock0),
      `wrong account approval block number,
      expected  ${expectedApprovedSinceBlock0}
      got       ${actualApprovedSinceBlock0}`
    );

    // creating empty blocks should make no difference
    await Util.createEmptyBlock(5);

    assert(
      actualApprovedSinceBlock0.eq(expectedApprovedSinceBlock0),
      `wrong account approval block number (after waiting 5 blocks),
      expected  ${expectedApprovedSinceBlock0}
      got       ${actualApprovedSinceBlock0}`
    );
  });
});
