import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import fs from "fs";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowERC20, FlowERC20IOStruct } from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC20Clone,  flowERC20Implementation } from "../../../utils/deploy/flow/flowERC20/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC20 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC20Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC20 multicall tests", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;
  const ME = () => op(Opcode.context, 0x0001); // base context this
  const YOU = () => op(Opcode.context, 0x0000); // base context sender
  const flowERC20ABI = JSON.parse(
    fs.readFileSync(
      "artifacts/contracts/flow/erc20/FlowERC20.sol/FlowERC20.json",
      "utf-8"
    )
  );
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should call multiple flows from same flow contract at once using multicall", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

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

    const flowERC20IO_A: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer_A,
    };

    const constants_A = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO_A.mints[0].amount,
      flowERC20IO_A.burns[0].amount,
      flowTransfer_A.erc721[0].token,
      flowTransfer_A.erc721[0].id,
      flowTransfer_A.erc1155[0].token,
      flowTransfer_A.erc1155[0].id,
      flowTransfer_A.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const MINT_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 8));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 9));

    const sourceFlowIO_A = concat([
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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowTransfer_B: FlowTransferStruct = {
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

    const flowERC20IO_B: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer_B,
    };

    const constants_B = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO_B.mints[0].amount,
      flowERC20IO_B.burns[0].amount,
      flowTransfer_B.erc20[0].token,
      flowTransfer_B.erc20[0].amount,
      flowTransfer_B.erc721[0].token,
      flowTransfer_B.erc721[0].id,
    ];

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO_B = concat([
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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants: constants_A,
      },
      flows: [
        { sources: [sourceFlowIO_A], constants: constants_A },
        { sources: [sourceFlowIO_B], constants: constants_B },
      ],
    };

    const { flow , flowCloneTx} = await flowERC20Clone(
      cloneFactory,
      implementation,
      expressionConfigStruct
    );

    const flowInitialized = (await getEvents(
      flowCloneTx,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // prepare output ERC1155

    await erc1155Out.mintNewToken();

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowTransfer_A.erc1155[0].id,
      flowTransfer_A.erc1155[0].amount,
      new Uint8Array()
    );

    // prepare input ERC721

    await erc721In.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer_A.erc721[0].id
    );

    await erc721In
      .connect(you)
      .approve(me.address, flowTransfer_A.erc721[0].id);

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer_B.erc721[0].id
    );

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer_B.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer_B.erc20[0].amount);
    const flowStruct_A = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct_A,
      fillEmptyAddressERC20(flowERC20IO_A, flow.address)
    );

    const flowStruct_B = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[1].evaluable, [1234], []);

    compareStructs(
      flowStruct_B,
      fillEmptyAddressERC20(flowERC20IO_B, flow.address)
    );

    const iFlow = new ethers.utils.Interface(flowERC20ABI.abi);
    const encode_flowA = iFlow.encodeFunctionData("flow", [
      flowInitialized[0].evaluable,
      [1234],
      [],
    ]);
    const encode_flowB = iFlow.encodeFunctionData("flow", [
      flowInitialized[1].evaluable,
      [1234],
      [],
    ]);

    // MULTI CALL
    await flow.connect(you).multicall([encode_flowA, encode_flowB]);
    // check input ERC721 affected balances correctly

    const me721BalanceIn = await erc721In.balanceOf(me.address);
    const you721BalanceIn = await erc721In.balanceOf(you.address);
    const owner721In = await erc721In.ownerOf(flowTransfer_A.erc721[0].id);

    assert(me721BalanceIn.eq(1));
    assert(you721BalanceIn.isZero());
    assert(owner721In === me.address);

    // check output ERC1155 affected balances correctly

    const me1155BalanceOut = await erc1155Out.balanceOf(
      me.address,
      flowTransfer_A.erc1155[0].id
    );
    const you1155BalanceOut = await erc1155Out.balanceOf(
      you.address,
      flowTransfer_A.erc1155[0].id
    );

    assert(me1155BalanceOut.isZero());
    assert(you1155BalanceOut.eq(flowTransfer_A.erc1155[0].amount as BigNumber));

    // check input ERC20 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(me20BalanceIn.eq(flowTransfer_B.erc20[0].amount as BigNumber));
    assert(you20BalanceIn.isZero());

    // check output ERC721 affected balances correctly
    const me721BalanceOut = await erc721Out.balanceOf(me.address);
    const you721BalanceOut = await erc721Out.balanceOf(you.address);
    const owner721Out = await erc721Out.ownerOf(flowTransfer_B.erc721[0].id);

    assert(me721BalanceOut.isZero());
    assert(you721BalanceOut.eq(1));
    assert(owner721Out === you.address);
  });
});
