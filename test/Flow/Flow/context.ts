import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory, ReserveToken18 } from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddress } from "../../../utils/flow";
import { timewarp } from "../../../utils/hardhat";
import {
  Debug,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps, RainterpreterOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = RainterpreterOps;

describe("Flow context tests", async function () {
  let flowFactory: FlowFactory;
  const ME = () => op(Opcode.CALLER);
  const YOU = () => op(Opcode.CONTEXT, 0x0000);

  before(async () => {
    flowFactory = await flowFactoryDeploy();
  });

  it("should register and load flow times into context (throttle flow output amount)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowStructFull: FlowTransferStruct = {
      native: [],
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

    const flowStructReduced: FlowTransferStruct = {
      native: [],
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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowStructFull.erc20[0].token,
      flowStructFull.erc20[0].amount,
      flowStructFull.erc20[1].token,
      flowStructFull.erc20[1].amount,
      flowStructReduced.erc20[1].amount,
      86400,
    ];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_FULL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_REDU = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6));
    const ONE_DAY = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7));

    const CONTEXT_FLOW_ID = () => op(Opcode.CONTEXT, 0x0001);
    const CONTEXT_FLOW_TIME = () => op(Opcode.CONTEXT, 0x0002);

    // prettier-ignore
    const sourceFlowIO = concat([
      op(Opcode.BLOCK_TIMESTAMP), // on stack for debugging // Value
      CONTEXT_FLOW_ID(), // Key
      op(Opcode.CHANGE_STATE),
      
      CONTEXT_FLOW_ID(), // Key
      op(Opcode.READ_STATE),
      op(Opcode.DEBUG, Debug.StatePacked),

      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      ME(),
      YOU(),
        //   CONTEXT_FLOW_TIME(),
        // op(Opcode.ISZERO),
        // FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_FULL(),
        //     op(Opcode.BLOCK_TIMESTAMP),
        //       CONTEXT_FLOW_TIME(),
        //       ONE_DAY(),
        //     op(Opcode.ADD, 2),
        //   op(Opcode.LESS_THAN), // is current timestamp within 24 hour window?
        //   FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_REDU(), // reduced
          FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_FULL(), // else full
        // op(Opcode.EAGER_IF),
      // op(Opcode.EAGER_IF),
      // 1) if no flow time, default amount
      // 2) else if within 24 hours of last flow time, throttle amount
      // 3) else default amount

      SENTINEL(), // NATIVE SKIP
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfig = {
      stateConfig: { sources, constants },
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    };

    const { flow } = await flowDeploy(deployer, flowFactory, flowConfigStruct);

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

    await flow.connect(you).previewFlow(flowInitialized[0].dispatch, 1234, []);
    const flowStruct0 = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].dispatch, 1234, []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].dispatch, 1234, []);

    compareStructs(flowStruct0, fillEmptyAddress(flowStructFull, flow.address));

    const _txFlow0 = await flow
      .connect(you)
      .flow(flowInitialized[0].dispatch, 1234, []);

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

    // // next flow (reduced amount)

    // console.log("WARP 12 HOURS");

    // await timewarp(86400 / 2);

    // // Ensure parties hold enough ERC20 for this flow
    // await erc20In.transfer(you.address, flowStructReduced.erc20[0].amount);
    // await erc20Out.transfer(me.address, flowStructReduced.erc20[1].amount);
    // await erc20In
    //   .connect(you)
    //   .approve(me.address, flowStructReduced.erc20[0].amount);

    // console.log("FLOW 1");

    // const flowStruct1 = await flow
    //   .connect(you)
    //   .previewFlow(flowInitialized[0].dispatch, 1234, []);

    // await flow
    //   .connect(you)
    //   .callStatic.flow(flowInitialized[0].dispatch, 1234, []);

    // compareStructs(
    //   flowStruct1,
    //   fillEmptyAddress(flowStructReduced, flow.address)
    // );

    // const _txFlow1 = await flow
    //   .connect(you)
    //   .flow(flowInitialized[0].dispatch, 1234, []);

    // const meBalanceIn1 = await erc20In.balanceOf(me.address);
    // const meBalanceOut1 = await erc20Out.balanceOf(me.address);
    // const youBalanceIn1 = await erc20In.balanceOf(you.address);
    // const youBalanceOut1 = await erc20Out.balanceOf(you.address);

    // for (const erc20Transfer1 of flowStruct1.erc20) {
    //   if (erc20Transfer1.to == me.address) {
    //     assert(
    //       meBalanceIn1.eq(erc20Transfer1.amount.add(meBalanceIn0)),
    //       `wrong balance for me (flow contract)
    //       expected  ${erc20Transfer1.amount.add(meBalanceIn0)}
    //       got       ${meBalanceIn1}`
    //     );
    //   } else if (erc20Transfer1.to == you.address) {
    //     assert(
    //       youBalanceOut1.eq(erc20Transfer1.amount.add(youBalanceOut0)),
    //       `wrong balance for you (signer1 contract)
    //       expected  ${erc20Transfer1.amount.add(youBalanceOut0)}
    //       got       ${youBalanceOut1}`
    //     );
    //   }
    // }

    // assert(
    //   meBalanceOut1.eq(BigNumber.from(0)),
    //   `wrong balance for me (flow contract)
    //   expected  ${0}
    //   got       ${meBalanceOut1}`
    // );

    // assert(
    //   youBalanceIn1.eq(BigNumber.from(0)),
    //   `wrong balance for me (flow contract)
    //   expected  ${0}
    //   got       ${youBalanceIn1}`
    // );

    // // final flow (full amount beyond 24 hours since last flow time)

    // console.log("WARP 24 HOURS");

    // await timewarp(86400 + 100);

    // // Ensure parties hold enough ERC20 for this flow
    // await erc20In.transfer(you.address, flowStructFull.erc20[0].amount);
    // await erc20Out.transfer(me.address, flowStructFull.erc20[1].amount);
    // await erc20In
    //   .connect(you)
    //   .approve(me.address, flowStructFull.erc20[0].amount);

    // console.log("FLOW 2");

    // const flowStruct2 = await flow
    //   .connect(you)
    //   .previewFlow(flowInitialized[0].dispatch, 1234, []);

    // await flow
    //   .connect(you)
    //   .callStatic.flow(flowInitialized[0].dispatch, 1234, []);

    // compareStructs(flowStruct2, fillEmptyAddress(flowStructFull, flow.address));

    // const _txFlow2 = await flow
    //   .connect(you)
    //   .flow(flowInitialized[0].dispatch, 1234, []);

    // const meBalanceIn2 = await erc20In.balanceOf(me.address);
    // const meBalanceOut2 = await erc20Out.balanceOf(me.address);
    // const youBalanceIn2 = await erc20In.balanceOf(you.address);
    // const youBalanceOut2 = await erc20Out.balanceOf(you.address);

    // for (const erc20Transfer2 of flowStruct2.erc20) {
    //   if (erc20Transfer2.to == me.address) {
    //     assert(
    //       meBalanceIn2.eq(erc20Transfer2.amount.add(meBalanceIn1)),
    //       `wrong balance for me (flow contract)
    //       expected  ${erc20Transfer2.amount.add(meBalanceIn1)}
    //       got       ${meBalanceIn2}`
    //     );
    //   } else if (erc20Transfer2.to == you.address) {
    //     assert(
    //       youBalanceOut2.eq(erc20Transfer2.amount.add(youBalanceOut1)),
    //       `wrong balance for you (signer1 contract)
    //       expected  ${erc20Transfer2.amount.add(youBalanceOut1)}
    //       got       ${youBalanceOut2}`
    //     );
    //   }
    // }

    // assert(
    //   meBalanceOut2.eq(BigNumber.from(0)),
    //   `wrong balance for me (flow contract)
    //   expected  ${0}
    //   got       ${meBalanceOut2}`
    // );

    // assert(
    //   youBalanceIn2.eq(BigNumber.from(0)),
    //   `wrong balance for me (flow contract)
    //   expected  ${0}
    //   got       ${youBalanceIn2}`
    // );
  });

  // it("should register and load flow times into context (canFlow if no registered flow)", async () => {
  //   const signers = await ethers.getSigners();
  //   const deployer = signers[0];
  //   const you = signers[1];

  //   const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
  //   await erc20In.initialize();

  //   const erc20Out = (await basicDeploy(
  //     "ReserveToken18",
  //     {}
  //   )) as ReserveToken18;
  //   await erc20Out.initialize();

  //   const flowTransfer: FlowTransferStruct = {
  //     native: [],
  //     erc20: [
  //       {
  //         from: you.address,
  //         to: "", // Contract address
  //         token: erc20In.address,
  //         amount: ethers.BigNumber.from(10 + eighteenZeros),
  //       },
  //       {
  //         from: "", // Contract address
  //         to: you.address,
  //         token: erc20Out.address,
  //         amount: ethers.BigNumber.from(10 + eighteenZeros),
  //       },
  //     ],
  //     erc721: [],
  //     erc1155: [],
  //   };

  //   const constants = [
  //     RAIN_FLOW_SENTINEL,
  //     1,
  //     flowTransfer.erc20[0].token,
  //     flowTransfer.erc20[0].amount,
  //     flowTransfer.erc20[1].token,
  //     flowTransfer.erc20[1].amount,
  //   ];

  //   const SENTINEL = () =>
  //     op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
  //   const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
  //     op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
  //   const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
  //     op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
  //   const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
  //     op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));
  //   const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
  //     op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));

  //   const CONTEXT_FLOW_TIME = () => op(Opcode.CONTEXT, 0x0002);

  //   const sourceFlowIO = concat([
  //     op(Opcode.BLOCK_TIMESTAMP), // on stack for debugging
  //     CONTEXT_FLOW_TIME(),
  //     op(Opcode.DEBUG, Debug.StatePacked),

  //     CONTEXT_FLOW_TIME(),
  //     op(Opcode.ISZERO), // can flow if no registered flow time
  //     op(Opcode.ENSURE, 1),
  //     SENTINEL(), // ERC1155 SKIP
  //     SENTINEL(), // ERC721 SKIP
  //     SENTINEL(), // ERC20 END
  //     FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
  //     YOU(),
  //     ME(),
  //     FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
  //     FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
  //     ME(),
  //     YOU(),
  //     FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
  //     SENTINEL(), // NATIVE SKIP
  //   ]);

  //   const sources = [];

  //   const flowConfigStruct: FlowConfig = {
  //     stateConfig: { sources, constants },
  //     flows: [
  //       {
  //         sources: [sourceFlowIO],
  //         constants,
  //       },
  //     ],
  //   };

  //   const { flow } = await flowDeploy(deployer, flowFactory, flowConfigStruct);

  //   const flowInitialized = (await getEvents(
  //     flow.deployTransaction,
  //     "FlowInitialized",
  //     flow
  //   )) as FlowInitializedEvent["args"][];

  //   const me = flow;

  //   // Ensure parties hold enough ERC20 for this flow
  //   await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
  //   await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);
  //   await erc20In
  //     .connect(you)
  //     .approve(me.address, flowTransfer.erc20[0].amount);

  //   const flowStruct0 = await flow
  //     .connect(you)
  //     .previewFlow(flowInitialized[0].dispatch, 1234, []);

  //   await flow
  //     .connect(you)
  //     .callStatic.flow(flowInitialized[0].dispatch, 1234, []);

  //   compareStructs(flowStruct0, fillEmptyAddress(flowTransfer, flow.address));

  //   const _txFlow0 = await flow
  //     .connect(you)
  //     .flow(flowInitialized[0].dispatch, 1234, []);

  //   const meBalanceIn0 = await erc20In.balanceOf(me.address);
  //   const meBalanceOut0 = await erc20Out.balanceOf(me.address);
  //   const youBalanceIn0 = await erc20In.balanceOf(you.address);
  //   const youBalanceOut0 = await erc20Out.balanceOf(you.address);

  //   for (const erc20Transfer of flowStruct0.erc20) {
  //     if (erc20Transfer.to == me.address) {
  //       assert(
  //         meBalanceIn0.eq(erc20Transfer.amount),
  //         `wrong balance for me (flow contract)
  //         expected  ${erc20Transfer.amount}
  //         got       ${meBalanceIn0}`
  //       );
  //     } else if (erc20Transfer.to == you.address) {
  //       assert(
  //         youBalanceOut0.eq(erc20Transfer.amount),
  //         `wrong balance for you (signer1 contract)
  //         expected  ${erc20Transfer.amount}
  //         got       ${youBalanceOut0}`
  //       );
  //     }
  //   }

  //   assert(
  //     meBalanceOut0.eq(BigNumber.from(0)),
  //     `wrong balance for me (flow contract)
  //     expected  ${0}
  //     got       ${meBalanceOut0}`
  //   );

  //   assert(
  //     youBalanceIn0.eq(BigNumber.from(0)),
  //     `wrong balance for me (flow contract)
  //     expected  ${0}
  //     got       ${youBalanceIn0}`
  //   );

  //   await assertError(
  //     async () =>
  //       await flow.connect(you).flow(flowInitialized[0].dispatch, 1234, []),
  //     "Transaction reverted without a reason string",
  //     "did not prevent flow when a flow time already registered"
  //   );
  // });
});
