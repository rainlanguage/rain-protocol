import { strict as assert } from "assert";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  Flow,
  FlowTransferV1Struct,
} from "../../../typechain/contracts/flow/basic/Flow";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddress } from "../../../utils/flow";
import {
  opMetaHash,
  standardEvaluableConfig,
} from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

import fs from "fs";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("Flow multiCall tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;
  const flowABI = JSON.parse(
    fs.readFileSync(
      "artifacts/contracts/flow/basic/Flow.sol/Flow.json",
      "utf-8"
    )
  );

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should call multiple flows from same flow contract at once using multicall", async () => {
    // FLOW ERC20 -- ERC721

    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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

    const flowTransfer_A: FlowTransferV1Struct = {
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

    const { sources: sourceFlowIO_A, constants: constantsFlowIO_A } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-me-to-you-erc721-token: ${flowTransfer_A.erc721[0].token},
        flowtransfer-me-to-you-erc721-id: ${flowTransfer_A.erc721[0].id},
        flowtransfer-you-to-me-erc20-token:  ${flowTransfer_A.erc20[0].token},
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer_A.erc20[0].amount},

        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,
        erc721-token: flowtransfer-me-to-you-erc721-token,
        erc721-from: me,
        erc721-to: you,
        erc721-id: flowtransfer-me-to-you-erc721-id,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,
        erc20-token: flowtransfer-you-to-me-erc20-token,
        erc20-from: you,
        erc20-to: me,
        erc20-amount: flowtransfer-you-to-me-erc20-amount;
      `
      );

    // FLOW_B
    const flowTransfer_B: FlowTransferV1Struct = {
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

    const { sources: sourceFlowIO_B, constants: constantsFlowIO_B } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-you-to-me-erc721-token: ${flowTransfer_B.erc721[0].token},
        flowtransfer-you-to-me-erc721-id: ${flowTransfer_B.erc721[0].id},
        flowtransfer-me-to-you-erc1155-token:  ${flowTransfer_B.erc1155[0].token},
        flowtransfer-me-to-you-erc1155-id: ${flowTransfer_B.erc1155[0].id},
        flowtransfer-me-to-you-erc1155-amount: ${flowTransfer_B.erc1155[0].amount},

        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,
        /* 0 */
        erc1155-token: flowtransfer-me-to-you-erc1155-token,
        erc1155-from: me,
        erc1155-to: you,
        erc1155-id: flowtransfer-me-to-you-erc1155-id,
        erc1155-amount: flowtransfer-me-to-you-erc1155-amount,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,
        erc721-token: flowtransfer-you-to-me-erc721-token,
        erc721-from: you,
        erc721-to: me,
        erc721-id: flowtransfer-you-to-me-erc721-id,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel;

      `
      );

    const flowConfigStruct_A: FlowConfig = {
      flows: [
        { sources: sourceFlowIO_A, constants: constantsFlowIO_A },
        { sources: sourceFlowIO_B, constants: constantsFlowIO_B },
      ],
    };

    const { flow: flow_A } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
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
      .previewFlow(flowInitialized_A[0].evaluable, [1234], []);

    await flow_A
      .connect(you)
      .callStatic.flow(flowInitialized_A[0].evaluable, [1234], []);

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
      .previewFlow(flowInitialized_A[1].evaluable, [1234], []);

    await flow_A
      .connect(you)
      .callStatic.flow(flowInitialized_A[1].evaluable, [1234], []);

    compareStructs(
      flowStruct_B,
      fillEmptyAddress(flowTransfer_B, flow_A.address)
    );

    const iFlow = new ethers.utils.Interface(flowABI.abi);
    const encode_flowA = iFlow.encodeFunctionData("flow", [
      flowInitialized_A[0].evaluable,
      [1234],
      [],
    ]);
    const encode_flowB = iFlow.encodeFunctionData("flow", [
      flowInitialized_A[1].evaluable,
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
