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

let verifyFactory;

describe("Verify", async function () {
  before(async () => {
    verifyFactory = await ethers.getContractFactory("Verify");
  });

  it("should hold correct public constants", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const verify = await verifyFactory.deploy(admin.address);

    assert(
      (await verify.APPROVER_ADMIN()) === APPROVER_ADMIN,
      "wrong APPROVER_ADMIN hash value"
    );
    assert((await verify.APPROVER()) === APPROVER, "wrong APPROVER hash value");

    assert(
      (await verify.REMOVER_ADMIN()) === REMOVER_ADMIN,
      "wrong REMOVER_ADMIN hash value"
    );
    assert((await verify.REMOVER()) === REMOVER, "wrong REMOVER hash value");

    assert(
      (await verify.BANNER_ADMIN()) === BANNER_ADMIN,
      "wrong BANNER_ADMIN hash value"
    );
    assert((await verify.BANNER()) === BANNER, "wrong BANNER hash value");
  });

  it("should correctly set up access control roles for admin in constructor", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];

    const verify = await verifyFactory.deploy(admin.address);

    // admin (specified in constructor) has all roles
    assert(
      await verify.hasRole(APPROVER_ADMIN, admin.address),
      "admin did not have APPROVER_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(REMOVER_ADMIN, admin.address),
      "admin did not have REMOVER_ADMIN role after construction"
    );
    assert(
      await verify.hasRole(BANNER_ADMIN, admin.address),
      "admin did not have BANNER_ADMIN role after construction"
    );
  });

  it("should allow anyone to map their account to a Verify session id", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];

    const verify = await verifyFactory.deploy(admin.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");
    const SESSION_ID1 = ethers.BigNumber.from("12345678901234567901");

    // signer1 generates verify session id
    await expect(verify.connect(signer1).add(SESSION_ID0))
      .to.emit(verify, "Add")
      .withArgs(signer1.address, SESSION_ID0);

    // check that signer1 is mapped to verify session
    assert(
      (await verify.ids(signer1.address)).eq(SESSION_ID0),
      "signer1 was not mapped to verify session after adding"
    );

    // prevent creating new verify session id if one exists
    await Util.assertError(
      async () => {
        await verify.connect(signer1).add(SESSION_ID1);
      },
      "revert OVERWRITE_ID",
      "created new verify for signer1 despite one existing"
    );
  });

  it("should allow admin to approve verify sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const approver = signers[2];

    const verify = await verifyFactory.deploy(admin.address);

    await verify.grantRole(await verify.APPROVER(), approver.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // approve verify session
    await expect(verify.connect(approver).approve(SESSION_ID0))
      .to.emit(verify, "Approve")
      .withArgs(SESSION_ID0);
  });

  it("should allow admin to remove accounts", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const remover = signers[2];

    const verify = await verifyFactory.deploy(admin.address);

    await verify.grantRole(await verify.REMOVER(), remover.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // admin removes account
    await expect(verify.connect(remover).remove(signer1.address))
      .to.emit(verify, "Remove")
      .withArgs(signer1.address);

    // check that signer1 has been deleted
    assert(
      (await verify.ids(signer1.address)).isZero(),
      "failed to remove address from verify session map"
    );
  });

  it("should allow admin to ban verify sessions", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();
    const admin = signers[0];
    const signer1 = signers[1];
    const banner = signers[2];

    const verify = await verifyFactory.deploy(admin.address);

    await verify.grantRole(await verify.BANNER(), banner.address);

    const SESSION_ID0 = ethers.BigNumber.from("10765432100123456789");

    // signer1 generates verify session id
    await verify.connect(signer1).add(SESSION_ID0);

    // admin bans verify session
    await expect(verify.connect(banner).ban(SESSION_ID0))
      .to.emit(verify, "Ban")
      .withArgs(SESSION_ID0);
  });
});
