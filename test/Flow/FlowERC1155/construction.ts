import { strict as assert } from "assert";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../typechain/contracts/factory/CloneFactory";

import {
  FlowERC1155,
  InitializeEvent,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";

import {
  assertError,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../../utils";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC1155Clone,
  flowERC1155Implementation,
} from "../../../utils/deploy/flow/flowERC1155/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import {
  opMetaHash,
  standardEvaluableConfig,
} from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC1155Config } from "../../../utils/types/flow";

describe("FlowERC1155 construction tests", async function () {
  let implementation: FlowERC1155;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC1155Implementation();

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
      `
    );

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

      /* variables */
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
       * burns of this erc1155 token
       */
      burnslist: seperator,

      /**
       * mints of this erc1155 token
       */
      mintslist: seperator;
    `
      );

    const flowERC1155Config: FlowERC1155Config = {
      uri: "F1155",
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
    };

    const { flow } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      flowERC1155Config
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowERC1155Config);
  });

  it("should fail if flowERC1155 is deployed with bad callerMeta", async function () {
    const flowERC1155Factory = await ethers.getContractFactory(
      "FlowERC1155",
      {}
    );

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow1155"),
        deployer: touchDeployer.address,
      };

    const flowERC1155 = (await flowERC1155Factory.deploy(
      deployerDiscoverableMetaConfig0
    )) as FlowERC1155;

    assert(
      !(flowERC1155.address === zeroAddress),
      "flowERC1155 did not deploy"
    );

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("sale"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () =>
        await flowERC1155Factory.deploy(deployerDiscoverableMetaConfig1),
      "UnexpectedMetaHash",
      "FlowERC1155 Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("flow1155"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
