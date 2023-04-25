import { assert } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { CloneFactory, ReserveToken18 } from "../../../typechain";
import {
  Flow,
  FlowTransferV1Struct,
} from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { fillEmptyAddress } from "../../../utils/flow";
import { timewarp } from "../../../utils/hardhat";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

describe("Flow context tests", async function () {
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

  it("should register and load flow times into context (throttle flow output amount)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowStructFull: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowStructReduced: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros).div(2), // reduced amount
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
        
        flowtransfer-you-to-me-erc20-token:  ${flowStructFull.erc20[0].token}, 
        flowtransfer-you-to-me-erc20-amount: ${flowStructFull.erc20[0].amount},
        flowtransfer-me-to-you-erc20-token:  ${flowStructFull.erc20[1].token}, 
        flowtransfer-me-to-you-erc20-amount-full: ${flowStructFull.erc20[1].amount},
        flowtransfer-me-to-you-erc20-amount-reduced: ${flowStructReduced.erc20[1].amount},
        one-day: 86400,
        flow-time: get(flow-id),

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
        erc20-amount-1:  eager-if(
          is-zero(flow-time) 
          flowtransfer-me-to-you-erc20-amount-full 
          eager-if(
            less-than(block-timestamp() add(flow-time one-day)) 
            flowtransfer-me-to-you-erc20-amount-reduced 
            flowtransfer-me-to-you-erc20-amount-full
          )
        ),
        
        /* Setting flow time */
        : set(flow-id block-timestamp());
      `
      );

    const flowConfigStruct: FlowConfig = {
      flows: [
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
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20 for this flow
    await erc20In.transfer(you.address, flowStructFull.erc20[0].amount);
    await erc20Out.transfer(me.address, flowStructFull.erc20[1].amount);
    await erc20In
      .connect(you)
      .approve(me.address, flowStructFull.erc20[0].amount);

    console.log("FLOW 0");
    const flowStruct0 = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct0, fillEmptyAddress(flowStructFull, flow.address));

    const _txFlow0 = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn0 = await erc20In.balanceOf(me.address);
    const meBalanceOut0 = await erc20Out.balanceOf(me.address);
    const youBalanceIn0 = await erc20In.balanceOf(you.address);
    const youBalanceOut0 = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer0 of flowStruct0.erc20) {
      if (erc20Transfer0.to == me.address) {
        assert(
          meBalanceIn0.eq(erc20Transfer0.amount),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer0.amount}
          got       ${meBalanceIn0}`
        );
      } else if (erc20Transfer0.to == you.address) {
        assert(
          youBalanceOut0.eq(erc20Transfer0.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer0.amount}
          got       ${youBalanceOut0}`
        );
      }
    }

    assert(
      meBalanceOut0.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut0}`
    );

    assert(
      youBalanceIn0.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn0}`
    );

    // next flow (reduced amount)

    console.log("WARP 12 HOURS");

    await timewarp(86400 / 2);

    // Ensure parties hold enough ERC20 for this flow
    await erc20In.transfer(you.address, flowStructReduced.erc20[0].amount);
    await erc20Out.transfer(me.address, flowStructReduced.erc20[1].amount);
    await erc20In
      .connect(you)
      .approve(me.address, flowStructReduced.erc20[0].amount);

    console.log("FLOW 1");

    const flowStruct1 = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);
    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct1,
      fillEmptyAddress(flowStructReduced, flow.address)
    );

    const _txFlow1 = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn1 = await erc20In.balanceOf(me.address);
    const meBalanceOut1 = await erc20Out.balanceOf(me.address);
    const youBalanceIn1 = await erc20In.balanceOf(you.address);
    const youBalanceOut1 = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer1 of flowStruct1.erc20) {
      if (erc20Transfer1.to == me.address) {
        assert(
          meBalanceIn1.eq(erc20Transfer1.amount.add(meBalanceIn0)),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer1.amount.add(meBalanceIn0)}
          got       ${meBalanceIn1}`
        );
      } else if (erc20Transfer1.to == you.address) {
        assert(
          youBalanceOut1.eq(erc20Transfer1.amount.add(youBalanceOut0)),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer1.amount.add(youBalanceOut0)}
          got       ${youBalanceOut1}`
        );
      }
    }

    assert(
      meBalanceOut1.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut1}`
    );

    assert(
      youBalanceIn1.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn1}`
    );

    // final flow (full amount beyond 24 hours since last flow time)

    console.log("WARP 24 HOURS");

    await timewarp(86400 + 100);

    // Ensure parties hold enough ERC20 for this flow
    await erc20In.transfer(you.address, flowStructFull.erc20[0].amount);
    await erc20Out.transfer(me.address, flowStructFull.erc20[1].amount);
    await erc20In
      .connect(you)
      .approve(me.address, flowStructFull.erc20[0].amount);

    console.log("FLOW 2");

    const flowStruct2 = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct2, fillEmptyAddress(flowStructFull, flow.address));

    const _txFlow2 = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn2 = await erc20In.balanceOf(me.address);
    const meBalanceOut2 = await erc20Out.balanceOf(me.address);
    const youBalanceIn2 = await erc20In.balanceOf(you.address);
    const youBalanceOut2 = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer2 of flowStruct2.erc20) {
      if (erc20Transfer2.to == me.address) {
        assert(
          meBalanceIn2.eq(erc20Transfer2.amount.add(meBalanceIn1)),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer2.amount.add(meBalanceIn1)}
          got       ${meBalanceIn2}`
        );
      } else if (erc20Transfer2.to == you.address) {
        assert(
          youBalanceOut2.eq(erc20Transfer2.amount.add(youBalanceOut1)),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer2.amount.add(youBalanceOut1)}
          got       ${youBalanceOut2}`
        );
      }
    }

    assert(
      meBalanceOut2.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut2}`
    );

    assert(
      youBalanceIn2.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn2}`
    );
  });

  it("should register and load flow times into context (canFlow if no registered flow)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
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
        flow-time: get(flow-id),
        
        /* CAN FLOW */
        : ensure(is-zero(flow-time)),

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
        
        /* Setting flow time */
        : set(flow-id block-timestamp());
      `
      );
    const flowConfigStruct: FlowConfig = {
      flows: [
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
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20 for this flow
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);
    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct0 = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct0, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow0 = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn0 = await erc20In.balanceOf(me.address);
    const meBalanceOut0 = await erc20Out.balanceOf(me.address);
    const youBalanceIn0 = await erc20In.balanceOf(you.address);
    const youBalanceOut0 = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer of flowStruct0.erc20) {
      if (erc20Transfer.to == me.address) {
        assert(
          meBalanceIn0.eq(erc20Transfer.amount),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer.amount}
          got       ${meBalanceIn0}`
        );
      } else if (erc20Transfer.to == you.address) {
        assert(
          youBalanceOut0.eq(erc20Transfer.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer.amount}
          got       ${youBalanceOut0}`
        );
      }
    }

    assert(
      meBalanceOut0.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut0}`
    );

    assert(
      youBalanceIn0.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn0}`
    );

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "Transaction reverted without a reason string",
      "did not prevent flow when a flow time already registered"
    );
  });
});
