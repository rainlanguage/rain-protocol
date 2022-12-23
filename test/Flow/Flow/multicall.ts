import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/basic/Flow";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddress } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

import fs from "fs";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";

const Opcode = AllStandardOps;

describe("Flow multiCall tests", async function () {
  let flowFactory: FlowFactory;
  const ME = () => op(Opcode.CONTEXT, 0x0001); // base context this
  const YOU = () => op(Opcode.CONTEXT, 0x0000); // base context sender
  const flowABI = JSON.parse(
    fs.readFileSync(
      "artifacts/contracts/flow/basic/Flow.sol/Flow.json",
      "utf-8"
    )
  );

  before(async () => {
    flowFactory = await flowFactoryDeploy();
  });

  it("should call multiple flows from same flow contract at once using multicall", async () => {
    // FLOW ERC20 -- ERC721

    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const erc721In = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721In.initialize();

    const erc1155Out = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155Out.initialize();

    const flowTransfer_A: FlowTransferStruct = {
      native: [],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
      ],
      erc721: [
        {
          token: erc721Out.address,
          from: "", // Contract address
          to: you.address,
          id: 0,
        },
      ],
      erc1155: [],
    };

    const constants_A = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer_A.erc20[0].token,
      flowTransfer_A.erc20[0].amount,
      flowTransfer_A.erc721[0].token,
      flowTransfer_A.erc721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));

    const sourceFlowIO_A = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID(),
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP
    ]);

    // FLOW_B

    const flowTransfer_B: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [
        {
          token: erc721In.address,
          from: you.address,
          to: "", // Contract Address
          id: 0,
        },
      ],
      erc1155: [
        {
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
          from: "", // Contract address
          to: you.address,
        },
      ],
    };

    const constants_B = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer_B.erc721[0].token,
      flowTransfer_B.erc721[0].id,
      flowTransfer_B.erc1155[0].token,
      flowTransfer_B.erc1155[0].id,
      flowTransfer_B.erc1155[0].amount,
    ];

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIO_B = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_ID(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT(),
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID(),
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
    ]);

    const sources = [];

    const flowConfigStruct_A: FlowConfig = {
      stateConfig: { sources, constants: constants_A },
      flows: [
        { sources: [sourceFlowIO_A], constants: constants_A },
        { sources: [sourceFlowIO_B], constants: constants_B },
      ],
    };

    const { flow: flow_A } = await flowDeploy(
      deployer,
      flowFactory,
      flowConfigStruct_A
    );

    const flowInitialized_A = (await getEvents(
      flow_A.deployTransaction,
      "FlowInitialized",
      flow_A
    )) as FlowInitializedEvent["args"][];

    const me_A = flow_A;

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me_A.address,
      flowTransfer_A.erc721[0].id
    );

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer_A.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me_A.address, flowTransfer_A.erc20[0].amount);

    const flowStruct = await flow_A
      .connect(you)
      .previewFlow(flowInitialized_A[0].dispatch, [1234], []);

    await flow_A
      .connect(you)
      .callStatic.flow(flowInitialized_A[0].dispatch, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddress(flowTransfer_A, flow_A.address)
    );

    // FLOW ERC721  -- ERC1155

    // prepare output ERC1155

    await erc1155Out.mintNewToken();

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me_A.address,
      flowTransfer_B.erc1155[0].id,
      flowTransfer_B.erc1155[0].amount,
      new Uint8Array()
    );

    // prepare input ERC721

    await erc721In.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer_B.erc721[0].id
    );

    await erc721In
      .connect(you)
      .approve(me_A.address, flowTransfer_B.erc721[0].id);

    const flowStruct_B = await flow_A
      .connect(you)
      .previewFlow(flowInitialized_A[1].dispatch, [1234], []);

    await flow_A
      .connect(you)
      .callStatic.flow(flowInitialized_A[1].dispatch, [1234], []);

    compareStructs(
      flowStruct_B,
      fillEmptyAddress(flowTransfer_B, flow_A.address)
    );

    const iFlow = new ethers.utils.Interface(flowABI.abi);
    const encode_flowA = iFlow.encodeFunctionData("flow", [
      flowInitialized_A[0].dispatch,
      [1234],
      [],
    ]);
    const encode_flowB = iFlow.encodeFunctionData("flow", [
      flowInitialized_A[1].dispatch,
      [1234],
      [],
    ]);

    // MULTI CALL
    await flow_A.connect(you).multicall([encode_flowA, encode_flowB]);

    // check input ERC20 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me_A.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(me20BalanceIn.eq(flowTransfer_A.erc20[0].amount as BigNumber));
    assert(you20BalanceIn.isZero());

    // check output ERC721 affected balances correctly
    const me721BalanceOut = await erc721Out.balanceOf(me_A.address);
    const you721BalanceOut = await erc721Out.balanceOf(you.address);
    const owner721Out = await erc721Out.ownerOf(flowTransfer_A.erc721[0].id);

    assert(me721BalanceOut.isZero());
    assert(you721BalanceOut.eq(1));
    assert(owner721Out === you.address);

    // ASSERTIONS B
    // check input ERC721 affected balances correctly

    const me_B721BalanceIn = await erc721In.balanceOf(me_A.address);
    const you721BalanceIn = await erc721In.balanceOf(you.address);
    const owner721In = await erc721In.ownerOf(flowTransfer_B.erc721[0].id);

    assert(me_B721BalanceIn.eq(1));
    assert(you721BalanceIn.isZero());
    assert(owner721In === me_A.address);

    // check output ERC1155 affected balances correctly

    const me_B1155BalanceOut = await erc1155Out.balanceOf(
      me_A.address,
      flowTransfer_B.erc1155[0].id
    );
    const you1155BalanceOut = await erc1155Out.balanceOf(
      you.address,
      flowTransfer_B.erc1155[0].id
    );

    assert(me_B1155BalanceOut.isZero());
    assert(you1155BalanceOut.eq(flowTransfer_B.erc1155[0].amount as BigNumber));
  });
});
