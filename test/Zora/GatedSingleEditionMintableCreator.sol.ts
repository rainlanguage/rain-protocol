import chai from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import type {
  CreatedGatedEditionEvent,
  GatedSingleEditionMintableCreator,
} from "../../typechain/GatedSingleEditionMintableCreator";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TypedEvent } from "../../typechain/common";
import type { SingleEditionMintableCreator } from "../../typechain/SingleEditionMintableCreator";
import type { SingleEditionMintable } from "../../typechain/SingleEditionMintable";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("GatedSingleEditionMintableCreator", async function () {
  let singleEditionMintableCreator: SingleEditionMintableCreator & Contract;
  let signers: SignerWithAddress[];
  let tier: ReadWriteTier & Contract;

  beforeEach(async () => {
    signers = await ethers.getSigners();

    const sharedNFTLogicFactory = await ethers.getContractFactory(
      "SharedNFTLogic"
    );
    const sharedNFTLogic = await sharedNFTLogicFactory.deploy();

    const singleEditionMintableFactory = await ethers.getContractFactory(
      "SingleEditionMintable"
    );
    const singleEditionMintable = (await singleEditionMintableFactory.deploy(
      sharedNFTLogic.address
    )) as SingleEditionMintable & Contract;

    const singleEditionMintableCreatorFactory = await ethers.getContractFactory(
      "SingleEditionMintableCreator"
    );
    singleEditionMintableCreator =
      (await singleEditionMintableCreatorFactory.deploy(
        singleEditionMintable.address
      )) as SingleEditionMintableCreator & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
  });

  it("creates a new edition", async () => {
    const gatedSingleEditionMintableCreatorFactory =
      await ethers.getContractFactory("GatedSingleEditionMintableCreator");
    const gatedSingleEditionMintableCreator =
      (await gatedSingleEditionMintableCreatorFactory.deploy(
        singleEditionMintableCreator.address
      )) as GatedSingleEditionMintableCreator & Contract;

    const createEditionTx =
      await gatedSingleEditionMintableCreator.createEdition(
        "Test",
        "TEST",
        "Testing",
        "https://ipfs.io/ipfsbafybeify52a63pgcshhbtkff4nxxxp2zp5yjn2xw43jcy4knwful7ymmgy",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        100,
        10,
        tier.address,
        0
      );

    const createEditionReceipt = await createEditionTx.wait();

    const createdGatedEditionEvent = createEditionReceipt.events.find(
      (event: TypedEvent) => event.event === "CreatedGatedEdition"
    ) as CreatedGatedEditionEvent | null;

    expect(createdGatedEditionEvent).to.not.be.null;
    expect(createdGatedEditionEvent.args.editionId).to.eq(0);
    expect(createdGatedEditionEvent.args.creator).to.eq(signers[0].address);
    expect(createdGatedEditionEvent.args.editionSize).to.eq(100);
    expect(createdGatedEditionEvent.args.wrapperContractAddress).to.not.be
      .null;
    expect(createdGatedEditionEvent.args.underlyingContractAddress).to.eq(
      await singleEditionMintableCreator.getEditionAtId(0)
    );
  });
});
