import { strict as assert } from "assert";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../typechain/contracts/factory/CloneFactory";

import {
  FlowERC721,
  InitializeEvent,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";

import {
  assertError,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../../utils";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import { opMetaHash, standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC721Config } from "../../../utils/types/flow";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("FlowERC721 construction tests", async function () {
  let cloneFactory: CloneFactory;
  let implementation: FlowERC721;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC721Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;

        /* sourceTokenURI */
        _: 1;
      `
    );

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        me: context<0 1>(),
        to: 2,
        amount: 2,
        seperator: 2,

        /**
         * erc1155 transfers
         */
        transfererc1155slist: seperator,

        /**
         * erc721 transfers
         */
        transfererc721slist: seperator,

        /**
         * er20 transfers
         */
        transfererc20slist: seperator,


        /**
         * burns of this erc721 token
         */
        burnslist: seperator,
        burnto: to,
        burnamount: amount,

        /**
         * mints of this erc721 token
         */
        mintslist: seperator,
        mintto: to,
        mintamount: amount;
      `
      );

    const flowERC721Config: FlowERC721Config = {
      name: "Flow ERC721",
      symbol: "F721",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
      ],
      baseURI: "https://www.rainprotocol.xyz/nft/",
    };

    const { flow } = await flowERC721Clone(
      deployer,
      cloneFactory,
      implementation,
      flowERC721Config
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowERC721Config);
  });

  it("should fail if flowERC721 is deployed with bad callerMeta", async function () {
    const flowERC721Factory = await ethers.getContractFactory("FlowERC721", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow721"),
        deployer: touchDeployer.address,
      };

    const flowERC721 = (await flowERC721Factory.deploy(
      deployerDiscoverableMetaConfig0
    )) as FlowERC721;

    assert(!(flowERC721.address === zeroAddress), "flowERC721 did not deploy");

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () =>
        await flowERC721Factory.deploy(deployerDiscoverableMetaConfig1),
      "UnexpectedMetaHash",
      "FlowERC721 Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("flow721"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
