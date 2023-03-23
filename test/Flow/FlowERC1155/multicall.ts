import { assert } from "chai";
import { BigNumber } from "ethers";
import fs from "fs";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC1155,
  FlowERC1155IOStruct,
  FlowTransferStruct,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";
import {
  flowERC1155Clone,
  flowERC1155Implementation,
} from "../../../utils/deploy/flow/flowERC1155/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { fillEmptyAddressERC1155 } from "../../../utils/flow";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("FlowERC1155 multiCall tests", async function () {
  let implementation: FlowERC1155;
  let cloneFactory: CloneFactory;
  const flowERC1155ABI = JSON.parse(
    fs.readFileSync(
      "artifacts/contracts/flow/erc1155/FlowERC1155.sol/FlowERC1155.json",
      "utf-8"
    )
  );
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC1155Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should call multiple flows from same flow contract at once using multicall", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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

    const flowERC1155IO_A: FlowERC1155IOStruct = {
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
    const flowERC1155IO_B: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer_B,
    };

    const { sources: sourceFlowIO_A, constants: constantsFlowIO_A } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        
        flowtransfer-you-to-me-erc721-token: ${flowTransfer_A.erc721[0].token},
        flowtransfer-you-to-me-erc721-id: ${flowTransfer_A.erc721[0].id},
        flowtransfer-me-to-you-erc1155-token:  ${flowTransfer_A.erc1155[0].token},
        flowtransfer-me-to-you-erc1155-id: ${flowTransfer_A.erc1155[0].id},
        flowtransfer-me-to-you-erc1155-amount: ${flowTransfer_A.erc1155[0].amount},
        
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
        transfererc20slist: sentinel,
        
        /**
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,
        
        /**
         * mints of this erc1155 token
        */
        mintslist: sentinel1155;
      `
      );

    const { sources: sourceFlowIO_B, constants: constantsFlowIO_B } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        
        flowtransfer-me-to-you-erc721-token: ${flowTransfer_B.erc721[0].token},
        flowtransfer-me-to-you-erc721-id: ${flowTransfer_B.erc721[0].id},
        flowtransfer-you-to-me-erc20-token:  ${flowTransfer_B.erc20[0].token}, 
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer_B.erc20[0].amount},
        
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
        erc20-amount: flowtransfer-you-to-me-erc20-amount,

        /**
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,
        
        /**
         * mints of this erc1155 token
        */
        mintslist: sentinel1155;
      `
      );
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct = {
      sources,
      constants: constants,
    };

    const { flow } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        uri: "F1155",
        expressionConfig: expressionConfigStruct,
        flows: [
          {
            sources: sourceFlowIO_A,
            constants: constantsFlowIO_A,
          },
          {
            sources: sourceFlowIO_B,
            constants: constantsFlowIO_B,
          },
        ],
      }
    );

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

    // prepare output ERC721

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

    const flowStruct_A = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct_A,
      fillEmptyAddressERC1155(flowERC1155IO_A, me.address)
    );

    const flowStruct_B = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[1].evaluable, [1234], []);

    compareStructs(
      flowStruct_B,
      fillEmptyAddressERC1155(flowERC1155IO_B, me.address)
    );

    // MultiCall
    const iFlow = new ethers.utils.Interface(flowERC1155ABI.abi);
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
