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

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("ApprovingSingleEditionMintable", async function () {
  let approvingSingleEditionMintableCreator: ApprovingSingleEditionMintableCreator &
    Contract;
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
    const singleEditionMintableCreator =
      (await singleEditionMintableCreatorFactory.deploy(
        singleEditionMintable.address
      )) as SingleEditionMintableCreator & Contract;

    const approvingSingleEditionMintableFactory =
      await ethers.getContractFactory("ApprovingSingleEditionMintable");
    const approvingSingleEditionMintable =
      (await approvingSingleEditionMintableFactory.deploy()) as ApprovingSingleEditionMintable &
        Contract;

    const approvingSingleEditionMintableCreatorFactory =
      await ethers.getContractFactory("ApprovingSingleEditionMintableCreator");
    approvingSingleEditionMintableCreator =
      (await approvingSingleEditionMintableCreatorFactory.deploy(
        singleEditionMintableCreator.address,
        approvingSingleEditionMintable.address
      )) as ApprovingSingleEditionMintableCreator & Contract;
  });

  it("something", async () => {
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
      (event) => event.event === "CreatedApprovingEdition"
    ) as CreatedApprovingEditionEvent | null;

    const wrapperContract = (await ethers.getContractAt(
      "ApprovingSingleEditionMintable",
      createdApprovingEditionEvent.args.wrapperContractAddress
    )) as ApprovingSingleEditionMintable & Contract;

    const mintEditionTx = await wrapperContract.mintEdition(signers[1].address);
    const mintEditionReceipt = await mintEditionTx.wait();

    console.log(mintEditionReceipt);
  });
});
