import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  EvaluableStructOutput,
  Flow,
  FlowInitializedEvent,
} from "../../typechain/contracts/flow/basic/Flow";
import { basicDeploy, getEvents, opMetaHash, RESERVE_ONE, standardEvaluableConfig } from "../../utils";
import { solidityKeccak256 } from "ethers/lib/utils";
import { ReserveToken18 } from "../../typechain/contracts/test/testToken";
import {
  deployFlowClone,
  flowImplementation,
} from "../../utils/deploy/flow/basic/deploy";
import { CloneFactory } from "../../typechain";

import { flowCloneFactory } from "../../utils/deploy/factory/cloneFactory";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import assert from "assert";
import { FlowConfig } from "../../utils/types/flow";
import { rainlang } from "../../utils/extensions/rainlang";
import { RAIN_FLOW_SENTINEL } from "../../utils/constants/sentinel";

export let flowConfig: FlowConfig;
export let endDate: number;
export let invoiceDataHash: string;
export let implementation: Flow;
export let cloneFactory: CloneFactory;

let signers: SignerWithAddress[];
let deployer: SignerWithAddress;
let client: SignerWithAddress; // caller
let contractor: SignerWithAddress; // caller
let flowContract: Flow;
let dispatchSet: EvaluableStructOutput,
dispatchGet: EvaluableStructOutput;

before(async () => {
  signers = await ethers.getSigners();
  // Deploy 1820
  await deploy1820(signers[0]);
  implementation = await flowImplementation();
  //Deploy Clone Factory
  cloneFactory = await flowCloneFactory();
  deployer = signers[0];
  client = signers[1];
  contractor = signers[2];

  const erc20 = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
  await erc20.initialize();

  endDate = Date.now();

  invoiceDataHash = solidityKeccak256(
    ["uint256[]"],
    [[client.address, contractor.address, RESERVE_ONE, endDate]]
  );

  const { sources: source1, constants: constants1 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        :set(1 1),
        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel;
      `
      );

      const { sources: source2, constants: constants2 } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},

        :ensure(get(1)),
        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel;
      `
      );

  flowConfig = {
    flows: [
      {
        sources: source1,
        constants: constants1
      },
      {
        sources: source2,
        constants: constants2
      }
    ]
  }

  const { flow } = await deployFlowClone(
    deployer,
    cloneFactory,
    implementation,
    flowConfig
  );

  const flowInitialized = (await getEvents(
    flow.deployTransaction,
    "FlowInitialized",
    flow
  )) as FlowInitializedEvent["args"][];

  flowContract = flow;
  dispatchSet = flowInitialized[0].evaluable;
  dispatchGet = flowInitialized[1].evaluable;
});

it("Should deploy flow Contract", async () => {
  assert(flowContract.address != undefined);
  assert(dispatchSet != undefined);
  assert(dispatchGet != undefined);
});
