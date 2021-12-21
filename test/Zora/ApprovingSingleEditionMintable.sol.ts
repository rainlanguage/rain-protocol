import chai from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import type { ApprovingSingleEditionMintable } from "../../typechain/ApprovingSingleEditionMintable";
import type {
  ApprovingSingleEditionMintableCreator,
  CreatedApprovingEditionEvent,
} from "../../typechain/ApprovingSingleEditionMintableCreator";
import type { SingleEditionMintable } from "../../typechain/SingleEditionMintable";
import type { SingleEditionMintableCreator } from "../../typechain/SingleEditionMintableCreator";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("ApprovingSingleEditionMintable", async function () {
  let approvingSingleEditionMintableCreator: ApprovingSingleEditionMintableCreator &
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

    const approvingSingleEditionMintableCreatorFactory =
      await ethers.getContractFactory("ApprovingSingleEditionMintableCreator");
    approvingSingleEditionMintableCreator =
      (await approvingSingleEditionMintableCreatorFactory.deploy(
        singleEditionMintableCreator.address
      )) as ApprovingSingleEditionMintableCreator & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
  });

  it("approves minting based on tier ", async () => {
    const createEditionTx =
      await approvingSingleEditionMintableCreator.createEdition(
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
        2 // TODO: Make this an enum value (E.g. GOLD)
      );

    const createEditionReceipt = await createEditionTx.wait();

    const createdApprovingEditionEvent = createEditionReceipt.events.find(
      (event) => event.event === "CreatedApprovingEdition"
    ) as CreatedApprovingEditionEvent | null;

    const wrapperContract = (await ethers.getContractAt(
      "ApprovingSingleEditionMintable",
      createdApprovingEditionEvent.args.wrapperContractAddress
    )) as ApprovingSingleEditionMintable & Contract;

    await tier.setTier(signers[1].address, 2, []);
    await tier.setTier(signers[2].address, 1, []);

    const allowedMintEditionTx = await wrapperContract.mintEdition(
      signers[1].address
    );
    const allowedMintEditionReceipt = await allowedMintEditionTx.wait();

    console.log(allowedMintEditionReceipt);

    const rejectedMintEditionTx = await wrapperContract.mintEdition(
      signers[2].address
    );
    const rejectedMintEditionReceipt = await rejectedMintEditionTx.wait();

    console.log(rejectedMintEditionReceipt);
  });
});
