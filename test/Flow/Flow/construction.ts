import { assert } from "chai";
import { ethers } from "hardhat";

import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../typechain/contracts/factory/CloneFactory";

import {
  Flow,
  InitializeEvent,
} from "../../../typechain/contracts/flow/basic/Flow";
import {
  assertError,
  getRainMetaDocumentFromContract,
  validateContractMetaAgainstABI,
  zeroAddress,
} from "../../../utils";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("Flow construction tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        from: context<0 1>(),
        to: context<0 0>(),
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
        transfererc20slist: seperator;
      `
      );

    const flowConfig: FlowConfig = {
      flows: [
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
      ],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfig
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");
    compareStructs(config, flowConfig);
  });

  it("should fail if flow is deployed with bad callerMeta", async function () {
    const flowFactory = await ethers.getContractFactory("Flow", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const deployerDiscoverableMetaConfig0: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow"),
        deployer: touchDeployer.address,
      };

    const flow = (await flowFactory.deploy(
      deployerDiscoverableMetaConfig0
    )) as Flow;

    assert(!(flow.address === zeroAddress), "flow did not deploy");

    const deployerDiscoverableMetaConfig1: DeployerDiscoverableMetaV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () => await flowFactory.deploy(deployerDiscoverableMetaConfig1),
      "UnexpectedMetaHash",
      "Flow Deployed for bad hash"
    );
  });

  it("should validate contract meta with abi", async function () {
    assert(
      validateContractMetaAgainstABI("flow"),
      "Contract Meta Inconsistent with Contract ABI"
    );
  });
});
