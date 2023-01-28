import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import fs from "fs";
import { ethers } from "hardhat";
import {
  FlowERC721Factory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC721IOStruct,
  FlowTransferStruct,
  ExpressionConfigStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC721Deploy } from "../../../utils/deploy/flow/flowERC721/deploy";
import { flowERC721FactoryDeploy } from "../../../utils/deploy/flow/flowERC721/flowERC721Factory/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC721 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC721 multicall tests", async function () {
  let flowERC721Factory: FlowERC721Factory;
  const ME = () => op(Opcode.CONTEXT, 0x0001); // base context this
  const YOU = () => op(Opcode.CONTEXT, 0x0000); // base context sender
  const flowERC721ABI = JSON.parse(
    fs.readFileSync(
      "artifacts/contracts/flow/erc721/FlowERC721.sol/FlowERC721.json",
      "utf-8"
    )
  );
  before(async () => {
    flowERC721Factory = await flowERC721FactoryDeploy();
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

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

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
          from: "", // Contract Address
          to: you.address,
        },
      ],
    };

    const flowERC721IO_A: FlowERC721IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer_A,
    };

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

    const flowERC721IO_B: FlowERC721IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer_B,
    };

    const constants_A = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer_A.erc721[0].token,
      flowTransfer_A.erc721[0].id,
      flowTransfer_A.erc1155[0].token,
      flowTransfer_A.erc1155[0].id,
      flowTransfer_A.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 7));

    const constants_B = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer_B.erc20[0].token,
      flowTransfer_B.erc20[0].amount,
      flowTransfer_B.erc721[0].token,
      flowTransfer_B.erc721[0].id,
    ];

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 6));

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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants: constants_A,
    };

    const { flow } = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO_A],
          constants: constants_A,
        },
        {
          sources: [sourceFlowIO_B],
          constants: constants_B,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
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

    const flowStruct_A = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].dispatch, [1234], []);

    compareStructs(
      flowStruct_A,
      fillEmptyAddressERC721(flowERC721IO_A, me.address)
    );

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer_B.erc721[0].id
    );

    // prepare input ERC721
    await erc20In.transfer(you.address, flowTransfer_B.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer_B.erc20[0].amount);

    const flowStruct_B = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[1].dispatch, [1234], []);

    compareStructs(
      flowStruct_B,
      fillEmptyAddressERC721(flowERC721IO_B, me.address)
    );

    // MultiCall
    const iFlow = new ethers.utils.Interface(flowERC721ABI.abi);
    const encode_flowA = iFlow.encodeFunctionData("flow", [
      flowInitialized[0].dispatch,
      [1234],
      [],
    ]);
    const encode_flowB = iFlow.encodeFunctionData("flow", [
      flowInitialized[1].dispatch,
      [1234],
      [],
    ]);

    // MULTI CALL
    await flow.connect(you).multicall([encode_flowA, encode_flowB]);
    // check input ERC721 affected balances correctly

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

    // check input ERC721 affected balances correctly
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
