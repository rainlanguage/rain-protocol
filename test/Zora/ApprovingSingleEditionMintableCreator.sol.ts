import chai from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import type { Contract } from "ethers";
import type {
  CreatedApprovingEditionEvent,
  ApprovingSingleEditionMintableCreator,
} from "../../typechain/ApprovingSingleEditionMintableCreator";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { TypedEvent } from "../../typechain/common";
import type { SingleEditionMintableCreator } from "../../typechain/SingleEditionMintableCreator";
import type { SingleEditionMintable } from "../../typechain/SingleEditionMintable";
import type { ApprovingSingleEditionMintable } from "../../typechain/ApprovingSingleEditionMintable";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("ApprovingSingleEditionMintableCreator", async function () {
  let singleEditionMintableCreator: SingleEditionMintableCreator & Contract;
  let signers: SignerWithAddress[];

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
  });

  it("creates a new edition", async () => {
    const approvingSingleEditionMintableFactory =
      await ethers.getContractFactory("ApprovingSingleEditionMintable");
    const approvingSingleEditionMintable =
      (await approvingSingleEditionMintableFactory.deploy()) as ApprovingSingleEditionMintable &
        Contract;

    const approvingSingleEditionMintableCreatorFactory =
      await ethers.getContractFactory("ApprovingSingleEditionMintableCreator");
    const approvingSingleEditionMintableCreator =
      (await approvingSingleEditionMintableCreatorFactory.deploy(
        singleEditionMintableCreator.address,
        approvingSingleEditionMintable.address
      )) as ApprovingSingleEditionMintableCreator & Contract;

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
        10
      );

    const createEditionReceipt = await createEditionTx.wait();

    const createdApprovingEditionEvent = createEditionReceipt.events.find(
      (event: TypedEvent) => event.event === "CreatedApprovingEdition"
    ) as CreatedApprovingEditionEvent | null;

    expect(createdApprovingEditionEvent).to.not.be.null;
    expect(createdApprovingEditionEvent.args.editionId).to.eq(0);
    expect(createdApprovingEditionEvent.args.creator).to.eq(signers[0].address);
    expect(createdApprovingEditionEvent.args.editionSize).to.eq(100);
    expect(createdApprovingEditionEvent.args.wrapperContractAddress).to.eq(
      await approvingSingleEditionMintableCreator.getEditionAtId(0)
    );
    expect(createdApprovingEditionEvent.args.underlyingContractAddress).to.eq(
      await singleEditionMintableCreator.getEditionAtId(0)
    );
  });
});
