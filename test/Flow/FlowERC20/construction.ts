import { strict as assert } from "assert";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../typechain/contracts/factory/CloneFactory";

import {
  FlowERC20,
  InitializeEvent,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";

import {
  assertError,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../../utils";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC20Clone,
  flowERC20Implementation,
} from "../../../utils/deploy/flow/flowERC20/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { opMetaHash, standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC20Config } from "../../../utils/types/flow";

describe("FlowERC20 construction tests", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

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
         * burns of this erc20 token
         */
        burnslist: seperator,
        burnto: to,
        burnamount: amount,

        /**
         * mints of this erc20 token
         */
        mintslist: seperator,
        mintto: to,
        mintamount: amount;
      `
      );

    const flowERC20Config: FlowERC20Config = {
      name: "Flow ERC20",
      symbol: "F20",
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

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      flowERC20Config
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");
    compareStructs(config, flowERC20Config);
  });

  it("should fail if flowERC20 is deployed with bad callerMeta", async function () {
    const flowERC20Factory = await ethers.getContractFactory("FlowERC20", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow20"),
        deployer: touchDeployer.address,
      };

    const flowERC20 = (await flowERC20Factory.deploy(
      deployerDiscoverableMetaConfig0
    )) as FlowERC20;

    assert(!(flowERC20.address === zeroAddress), "flowERC20 did not deploy");

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () =>
        await flowERC20Factory.deploy(deployerDiscoverableMetaConfig1),
      "UnexpectedMetaHash",
      "FlowERC20 Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("flow20"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
