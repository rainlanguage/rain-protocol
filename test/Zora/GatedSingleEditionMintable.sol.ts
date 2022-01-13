import chai from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import type { GatedSingleEditionMintable } from "../../typechain/GatedSingleEditionMintable";
import type {
  GatedSingleEditionMintableCreator,
  CreatedGatedEditionEvent,
} from "../../typechain/GatedSingleEditionMintableCreator";
import type { SingleEditionMintable } from "../../typechain/SingleEditionMintable";
import type { SingleEditionMintableCreator } from "../../typechain/SingleEditionMintableCreator";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("GatedSingleEditionMintable", async function () {
  let gatedSingleEditionMintableCreator: GatedSingleEditionMintableCreator &
    Contract;
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
    const singleEditionMintableCreator =
      (await singleEditionMintableCreatorFactory.deploy(
        singleEditionMintable.address
      )) as SingleEditionMintableCreator & Contract;

    const gatedSingleEditionMintableCreatorFactory =
      await ethers.getContractFactory("GatedSingleEditionMintableCreator");
    gatedSingleEditionMintableCreator =
      (await gatedSingleEditionMintableCreatorFactory.deploy(
        singleEditionMintableCreator.address
      )) as GatedSingleEditionMintableCreator & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
  });

  it("approves minting based on tier ", async () => {
    await tier.setTier(signers[1].address, 2, []);
    await tier.setTier(signers[2].address, 1, []);

    const createEditionTx =
      await gatedSingleEditionMintableCreator.createEdition(
        {
          name: "Test",
          symbol: "TEST",
          description: "Testing",
          animationUrl:
            "https://ipfs.io/ipfsbafybeify52a63pgcshhbtkff4nxxxp2zp5yjn2xw43jcy4knwful7ymmgy",
          imageUrl: "",
          animationHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          imageHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          editionSize: 100,
          royaltyBPS: 10,
        },
        tier.address,
        2 // TODO: Make this an enum value (E.g. GOLD)
      );

    const createEditionReceipt = await createEditionTx.wait();

    const createdGatedEditionEvent = createEditionReceipt.events.find(
      (event) => event.event === "CreatedGatedEdition"
    ) as CreatedGatedEditionEvent | null;

    const wrapperContract = (await ethers.getContractAt(
      "GatedSingleEditionMintable",
      createdGatedEditionEvent.args.wrapperContractAddress
    )) as GatedSingleEditionMintable & Contract;

    await wrapperContract.mintEdition(signers[1].address);

    await expect(
      wrapperContract.mintEdition(signers[2].address)
    ).to.be.revertedWith("MIN_TIER");
  });
});
