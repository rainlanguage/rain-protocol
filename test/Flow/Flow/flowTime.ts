import { ethers } from "hardhat";
import { CloneFactory, ReserveToken18 } from "../../../typechain";
import {
  Flow,
  FlowTransferStruct,
} from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { assertError } from "../../../utils";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { FlowConfig } from "../../../utils/types/flow";

describe("Flow flowTime tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should support gating flows where a flow time has already been registered for the given id", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        flow-id: context<1 0>(),
        
        flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token}, 
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-me-to-you-erc20-token:  ${flowTransfer.erc20[1].token}, 
        flowtransfer-me-to-you-erc20-amount: ${flowTransfer.erc20[1].amount},

        /* CAN FLOW */
        : ensure(is-zero(get(flow-id))),

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
        transfererc20slist: sentinel,
        /* 0 */
        erc20-token-0: flowtransfer-you-to-me-erc20-token,
        erc20-from-0: you,
        erc20-to-0: me,
        erc20-amount-0: flowtransfer-you-to-me-erc20-amount,
        /* 1 */
        erc20-token-1: flowtransfer-me-to-you-erc20-token,
        erc20-from-1: me,
        erc20-to-1: you,
        erc20-amount-1: flowtransfer-me-to-you-erc20-amount,

        /**
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
        /* Setting flow time */
        : set(flow-id block-timestamp());
      `
      );

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // id 1234 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []);

    // id 5678 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].evaluable, [5678], []);

    // id 1234 - 2nd flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "Transaction reverted without a reason string",
      "did not gate flow where flow time already registered for the given flow & id"
    );
  });
});
