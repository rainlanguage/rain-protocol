import { assert } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC1155,
  FlowERC1155IOV1Struct,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowTransferV1Struct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
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
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC1155Config } from "../../../utils/types/flow";

describe("FlowERC1155 flow tests", async function () {
  let implementation: FlowERC1155;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC1155Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should not flow if number of sentinels is less than MIN_FLOW_SENTINELS", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    // Check when all sentinels are present
    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
          },
        ],
      }
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    assert(
      async () =>
        await flow
          .connect(you)
          .callStatic.flow(flowInitialized[0].evaluable, [1234], []),
      "Static Call Failed"
    );

    assert(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "Flow Failed"
    );

    // Check for erreneous number of sentinels
    const { sources: sourceFlowErr0, constants: constantsFlowErr0 } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

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

        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155;

        /**
         * Missing Mint sentinel
        */
      `
      );

    const { sources: sourcesErr0, constants: constantsErr0 } =
      await standardEvaluableConfig(
        rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
      );

    const expressionConfigErr0 = {
      sources: sourcesErr0,
      constants: constantsErr0,
    };

    const { flow: flowErr0 } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        uri: "F1155",
        expressionConfig: expressionConfigErr0,
        flows: [
          {
            sources: sourceFlowErr0,
            constants: constantsFlowErr0,
          },
        ],
      }
    );

    const flowInitializedErr0 = (await getEvents(
      flowErr0.deployTransaction,
      "FlowInitialized",
      flowErr0
    )) as FlowInitializedEvent["args"][];

    assertError(
      async () =>
        await flowErr0
          .connect(you)
          .callStatic.flow(flowInitializedErr0[0].evaluable, [1234], []),
      "",
      "Erreneous Sentinels"
    );

    assertError(
      async () =>
        await flowErr0
          .connect(you)
          .flow(flowInitializedErr0[0].evaluable, [1234], []),
      "",
      "Flow For Erreneous Sentinels"
    );

    // Check for erreneous number of sentinels
    const { sources: sourceFlowErr1, constants: constantsFlowErr1 } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

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

        /**
         * Missing Burn Sentinel
         */

        /**
         * Missing Mint sentinel
        */
      `
      );

    const { sources: sourcesErr1, constants: constantsErr1 } =
      await standardEvaluableConfig(
        rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
      );

    const expressionConfigErr1 = {
      sources: sourcesErr1,
      constants: constantsErr1,
    };

    const { flow: flowErr1 } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        uri: "F1155",
        expressionConfig: expressionConfigErr1,
        flows: [
          {
            sources: sourceFlowErr1,
            constants: constantsFlowErr1,
          },
        ],
      }
    );

    const flowInitializedErr1 = (await getEvents(
      flowErr1.deployTransaction,
      "FlowInitialized",
      flowErr1
    )) as FlowInitializedEvent["args"][];

    assertError(
      async () =>
        await flowErr1
          .connect(you)
          .callStatic.flow(flowInitializedErr1[0].evaluable, [1234], []),
      "",
      "Erreneous Sentinels"
    );

    assertError(
      async () =>
        await flowErr1
          .connect(you)
          .flow(flowInitializedErr1[0].evaluable, [1234], []),
      "",
      "Flow For Erreneous Sentinels"
    );
  });

  it("should support transferPreflight hook", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(5 + eighteenZeros);

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        tokenid: ${tokenId},
        tokenamount: ${tokenAmount},

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

        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,

        /**
         * mints of this erc1155 token
         */
        mintslist: sentinel1155,
        mint-account mint-id mint-amount: you tokenid tokenamount;
      `
      );

    // prettier-ignore
    const { sources: sourceCanTransfer, constants: constantsCanTransfer } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: ensure(1) 1;
      `
    );

    // prettier-ignore
    const { sources: sourceCannotTransfer, constants: constantsCannotTransfer } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: ensure(0) 1;
      `
    );

    const expressionConfigStructCanTransfer: FlowERC1155Config = {
      uri: "F1155",
      expressionConfig: {
        sources: sourceCanTransfer,
        constants: constantsCanTransfer,
      },
      flows: [
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
      ],
    };
    const expressionConfigStructCannotTransfer: FlowERC1155Config = {
      uri: "F1155",
      expressionConfig: {
        sources: sourceCannotTransfer,
        constants: constantsCannotTransfer,
      },
      flows: [
        {
          sources: sourceFlowIO,
          constants: constantsFlowIO,
        },
      ],
    };

    const { flow: flowCanTransfer } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStructCanTransfer
    );
    const { flow: flowCannotTransfer } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStructCannotTransfer
    );

    const flowExpressionsCanTransfer = (await getEvents(
      flowCanTransfer.deployTransaction,
      "FlowInitialized",
      flowCanTransfer
    )) as FlowInitializedEvent["args"][];
    const flowExpressionsCannotTransfer = (await getEvents(
      flowCannotTransfer.deployTransaction,
      "FlowInitialized",
      flowCannotTransfer
    )) as FlowInitializedEvent["args"][];

    const signer1 = signers[1];
    const signerReceiver = signers[2];

    const _txFlowCanTransfer = await flowCanTransfer
      .connect(signer1)
      .flow(flowExpressionsCanTransfer[0].evaluable, [1234], []);

    const _txFlowCannotTransfer = await flowCannotTransfer
      .connect(signer1)
      .flow(flowExpressionsCannotTransfer[0].evaluable, [1234], []);

    // check minting worked
    const balanceCan0 = await flowCanTransfer.balanceOf(
      signer1.address,
      tokenId
    );
    const balanceCannot0 = await flowCannotTransfer.balanceOf(
      signer1.address,
      tokenId
    );

    console.log({ balanceCan0, balanceCannot0 });

    assert(
      balanceCan0.eq(tokenAmount),
      `balance ${balanceCan0} not equal amount ${tokenAmount}`
    );
    assert(balanceCannot0.eq(tokenAmount));

    await flowCanTransfer
      .connect(signer1)
      .safeTransferFrom(
        signer1.address,
        signerReceiver.address,
        tokenId,
        tokenAmount,
        []
      );

    await assertError(
      async () =>
        await flowCannotTransfer
          .connect(signer1)
          .safeTransferFrom(
            signer1.address,
            signerReceiver.address,
            tokenId,
            tokenAmount,
            []
          ),
      "",
      "transferred when it should not"
    );
  });

  it("should mint and burn tokens per flow in exchange for another token (e.g. ERC20)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransferMint: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(0),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowTransferBurn: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(0),
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

    // for mint flow
    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(5 + eighteenZeros);

    const flowERC1155IOMint: FlowERC1155IOV1Struct = {
      mints: [
        {
          account: you.address,
          id: tokenId,
          amount: tokenAmount,
        },
      ],
      burns: [],
      flow: flowTransferMint,
    };

    const flowERC1155IOBurn: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [
        {
          account: you.address,
          id: tokenId,
          amount: tokenAmount,
        },
      ],
      flow: flowTransferBurn,
    };

    const { sources: sourceFlowIOMint, constants: constantsFlowIOMint } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        flowio-input-token: ${flowERC1155IOMint.flow.erc20[0].token},
        flowio-output-token: ${flowERC1155IOMint.flow.erc20[1].token},
        flowio-input-erc20-amount: ${flowERC1155IOMint.flow.erc20[0].amount},
        flowio-output-erc20-amount: ${flowERC1155IOMint.flow.erc20[1].amount},
        tokenid: ${tokenId},
        tokenamount: ${tokenAmount},

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
        erc20-token-0 erc20-from-0 erc20-to-0 erc20-amount-0: flowio-input-token you me flowio-input-erc20-amount,
        /* 1 */
        erc20-from-1 erc20-to-1 erc20-amount-1: flowio-output-token me you flowio-output-erc20-amount,



        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,

        /**
         * mints of this erc1155 token
         */
        mintslist: sentinel1155,
        mint-account mint-id mint-amount: you tokenid tokenamount;
      `
      );

    const { sources: sourceFlowIOBurn, constants: constantsFlowIOBurn } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        flowio-input-token: ${flowERC1155IOBurn.flow.erc20[0].token},
        flowio-output-token: ${flowERC1155IOBurn.flow.erc20[1].token},
        flowio-input-erc20-amount: ${flowERC1155IOBurn.flow.erc20[0].amount},
        flowio-output-erc20-amount: ${flowERC1155IOBurn.flow.erc20[1].amount},
        tokenid: ${tokenId},
        tokenamount: ${tokenAmount},

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
        erc20-token-0 erc20-from-0 erc20-to-0 erc20-amount-0: flowio-input-token you me flowio-input-erc20-amount,
        /* 1 */
        erc20-token-1  erc20-from-1 erc20-to-1 erc20-amount-1: flowio-output-token me you flowio-output-erc20-amount,

        /**
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,
        burn-account burn-id burn-amount: you tokenid tokenamount,
        /**
         * mints of this erc1155 token
         */
        mintslist: sentinel1155;
      `
      );

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
      `
    );

    const expressionConfigStruct: FlowERC1155Config = {
      uri: "F1155",
      expressionConfig: {
        sources,
        constants: constants,
      },
      flows: [
        {
          sources: sourceFlowIOMint,
          constants: constantsFlowIOMint,
        },
        {
          sources: sourceFlowIOBurn,
          constants: constantsFlowIOBurn,
        },
      ],
    };

    const { flow } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const mintFlowId = flowInitialized[0].evaluable;
    const burnFlowId = flowInitialized[1].evaluable;

    const me = flow;

    // -- PERFORM MINT --

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransferMint.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransferMint.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransferMint.erc20[0].amount);

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, [1234], []);

    compareStructs(
      flowStructMint,
      fillEmptyAddressERC1155(flowERC1155IOMint, me.address)
    );

    const txFlowMint = await flow.connect(you).flow(mintFlowId, [1234], []);

    // Check Balances

    const meMintBalanceIn = await erc20In.balanceOf(me.address);
    const meMintBalanceOut = await erc20Out.balanceOf(me.address);
    const youMintBalanceIn = await erc20In.balanceOf(you.address);
    const youMintBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meMintBalanceIn.eq(await flowERC1155IOMint.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC1155IOMint.flow.erc20[0].amount}
      got       ${meMintBalanceIn}`
    );

    assert(
      meMintBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meMintBalanceOut}`
    );

    assert(
      youMintBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youMintBalanceIn}`
    );

    assert(
      youMintBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for you (signer1 contract)
      expected  ${0}
      got       ${youMintBalanceOut}`
    );

    const me20Balance1 = await flow.balanceOf(me.address, tokenId);
    const you20Balance1 = await flow.balanceOf(you.address, tokenId);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(tokenAmount));

    // -- PERFORM BURN --

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransferBurn.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransferBurn.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransferBurn.erc20[0].amount);

    const flowStructBurn = await flow
      .connect(you)
      .callStatic.flow(burnFlowId, [1234], []);

    compareStructs(
      flowStructBurn,
      fillEmptyAddressERC1155(flowERC1155IOBurn, me.address)
    );

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, [1234], []);

    // Check Balances

    const meBurnBalanceIn = await erc20In.balanceOf(me.address);
    const meBurnBalanceOut = await erc20Out.balanceOf(me.address);
    const youBurnBalanceIn = await erc20In.balanceOf(you.address);
    const youBurnBalanceOut = await erc20Out.balanceOf(you.address);

    // Has balance from previous tx
    assert(
      meBurnBalanceIn.eq(await flowERC1155IOMint.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC1155IOMint.flow.erc20[0].amount}
      got       ${meBurnBalanceIn}`
    );

    assert(
      meBurnBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBurnBalanceOut}`
    );

    assert(
      youBurnBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBurnBalanceIn}`
    );

    assert(
      youBurnBalanceOut.eq(await flowERC1155IOBurn.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC1155IOBurn.flow.erc20[1].amount}
      got       ${youBurnBalanceOut}`
    );

    const me20Balance2 = await flow.balanceOf(me.address, tokenId);
    const you20Balance2 = await flow.balanceOf(you.address, tokenId);

    assert(me20Balance2.isZero());
    assert(you20Balance2.isZero());
  });

  it("should flow for erc721<->erc1155 on the good path", async () => {
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

    const flowTransfer: FlowTransferV1Struct = {
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

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-you-to-me-erc721-token: ${flowTransfer.erc721[0].token},
        flowtransfer-you-to-me-erc721-id: ${flowTransfer.erc721[0].id},
        flowtransfer-me-to-you-erc1155-token:  ${flowTransfer.erc1155[0].token},
        flowtransfer-me-to-you-erc1155-id: ${flowTransfer.erc1155[0].id},
        flowtransfer-me-to-you-erc1155-amount: ${flowTransfer.erc1155[0].amount},

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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    // prepare input ERC721

    await erc721In.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc721[0].id
    );

    await erc721In.connect(you).approve(me.address, flowTransfer.erc721[0].id);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // check input ERC721 affected balances correctly

    const me721BalanceIn = await erc721In.balanceOf(me.address);
    const you721BalanceIn = await erc721In.balanceOf(you.address);
    const owner721In = await erc721In.ownerOf(flowTransfer.erc721[0].id);

    assert(me721BalanceIn.eq(1));
    assert(you721BalanceIn.isZero());
    assert(owner721In === me.address);

    // check output ERC1155 affected balances correctly

    const me1155BalanceOut = await erc1155Out.balanceOf(
      me.address,
      flowTransfer.erc1155[0].id
    );
    const you1155BalanceOut = await erc1155Out.balanceOf(
      you.address,
      flowTransfer.erc1155[0].id
    );

    assert(me1155BalanceOut.isZero());
    assert(you1155BalanceOut.eq(flowTransfer.erc1155[0].amount as BigNumber));
  });

  it("should flow for erc20<->erc721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowTransfer: FlowTransferV1Struct = {
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
    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-me-to-you-erc721-token: ${flowTransfer.erc721[0].token},
        flowtransfer-me-to-you-erc721-id: ${flowTransfer.erc721[0].id},
        flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token},
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},

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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[0].id
    );

    // prepare input ERC721
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // check input ERC721 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(me20BalanceIn.eq(flowTransfer.erc20[0].amount as BigNumber));
    assert(you20BalanceIn.isZero());

    // check output ERC721 affected balances correctly
    const me721BalanceOut = await erc721Out.balanceOf(me.address);
    const you721BalanceOut = await erc721Out.balanceOf(you.address);
    const owner721Out = await erc721Out.ownerOf(flowTransfer.erc721[0].id);

    assert(me721BalanceOut.isZero());
    assert(you721BalanceOut.eq(1));
    assert(owner721Out === you.address);
  });

  it("should flow for ERC1155<->ERC1155 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc1155In = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155In.initialize();

    const erc1155Out = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155Out.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155In.address,
          id: 0,
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
    };

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-you-to-me-erc1155-token:  ${flowTransfer.erc1155[0].token},
        flowtransfer-you-to-me-erc1155-id: ${flowTransfer.erc1155[0].id},
        flowtransfer-you-to-me-erc1155-amount: ${flowTransfer.erc1155[0].amount},
        flowtransfer-me-to-you-erc1155-token:  ${flowTransfer.erc1155[1].token},
        flowtransfer-me-to-you-erc1155-id: ${flowTransfer.erc1155[1].id},
        flowtransfer-me-to-you-erc1155-amount: ${flowTransfer.erc1155[1].amount},

        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,
        /* 0 */
        erc1155-token-0: flowtransfer-you-to-me-erc1155-token,
        erc1155-from-0: you,
        erc1155-to-0: me,
        erc1155-id-0: flowtransfer-you-to-me-erc1155-id,
        erc1155-amount-0: flowtransfer-you-to-me-erc1155-amount,
        /* 1 */
        erc1155-token-1: flowtransfer-me-to-you-erc1155-token,
        erc1155-from-1: me,
        erc1155-to-1: you,
        erc1155-id-1: flowtransfer-me-to-you-erc1155-id,
        erc1155-amount-1: flowtransfer-me-to-you-erc1155-amount,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,



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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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

    // Ensure parties hold ERC1155 tokens
    await erc1155In.mintNewToken();
    await erc1155Out.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(flowStruct.flow.erc1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.erc1155[0].amount}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(flowStruct.flow.erc1155[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.erc1155[1].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for ERC721<->ERC721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc721In = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [
        {
          token: erc721In.address,
          from: you.address,
          to: "", // Contract Address
          id: 0,
        },
        {
          token: erc721Out.address,
          from: "", // Contract Address
          to: you.address,
          id: 0,
        },
      ],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-you-to-me-erc721-token: ${flowTransfer.erc721[0].token},
        flowtransfer-you-to-me-erc721-id: ${flowTransfer.erc721[0].id},

        flowtransfer-me-to-you-erc721-token: ${flowTransfer.erc721[1].token},
        flowtransfer-me-to-you-erc721-id: ${flowTransfer.erc721[1].id},

        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,

        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,
        /* 0 */
        erc721-token-0: flowtransfer-you-to-me-erc721-token,
        erc721-from-0: you,
        erc721-to-0: me,
        erc721-id-0: flowtransfer-you-to-me-erc721-id,

        /* 1 */
        erc721-token-1: flowtransfer-me-to-you-erc721-token,
        erc721-from-1: me,
        erc721-to-1: you,
        erc721-id-1: flowtransfer-me-to-you-erc721-id,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,



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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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

    // Ensure parties hold erc1155 tokens
    await erc721In.mintNewToken();
    await erc721Out.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc721[0].id
    );
    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[1].id
    );

    await erc721In.connect(you).approve(me.address, flowTransfer.erc721[0].id);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc721In.balanceOf(me.address);
    const meBalanceOut = await erc721Out.balanceOf(me.address);
    const youBalanceIn = await erc721In.balanceOf(you.address);
    const youBalanceOut = await erc721Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(BigNumber.from(1)),
      `wrong balance for me (flow contract)
      expected  ${BigNumber.from(1)}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(BigNumber.from(1)),
      `wrong balance for you (signer1 contract)
      expected  ${BigNumber.from(1)}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for ERC20<->ERC20 on the good path", async () => {
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

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),

        flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token},
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-me-to-you-erc20-token:  ${flowTransfer.erc20[1].token},
        flowtransfer-me-to-you-erc20-amount: ${flowTransfer.erc20[1].amount},

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
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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

    // Ensure parties hold enough ERC721
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(flowStruct.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.erc20[0].amount}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(flowStruct.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.erc20[1].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should not be able to access values set in a flow across different flows", async () => {
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

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    // Sample key
    const key = 1337;
    const { sources: sourceFlowIOA, constants: constantsFlowIOA } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        key: ${key},
        flowtransfer-you-to-me-erc20-token: ${flowERC1155IO.flow.erc20[0].token},
        flowtransfer-me-to-you-erc20-token: ${flowERC1155IO.flow.erc20[1].token},
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-me-to-you-erc20-amount: ${flowTransfer.erc20[1].amount},

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
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,

        /**
         * mints of this erc1155 token
        */
        mintslist: sentinel1155,

        /* Setting a value */
        : set(key block-timestamp());
      `
      );
    const { sources: sourceFlowIOB, constants: constantsFlowIOB } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        key: ${key},
        flowtransfer-you-to-me-erc20-token: ${flowERC1155IO.flow.erc20[0].token},
        flowtransfer-me-to-you-erc20-token: ${flowERC1155IO.flow.erc20[1].token},
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-me-to-you-erc20-amount: ${flowTransfer.erc20[1].amount},

        /* Getting the value set in flowA and ensuring if that value is not set */
        : ensure(is-zero(get(key))),

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
         * burns of this erc1155 token
         */
        burnslist: sentinel1155,

        /**
         * mints of this erc1155 token
        */
        mintslist: sentinel1155,

        /* Setting a value */
        : set(key block-timestamp());
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
      constants,
    };

    const { flow } = await flowERC1155Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        uri: "F1155",
        expressionConfig: expressionConfigStruct,
        flows: [
          { sources: sourceFlowIOA, constants: constantsFlowIOA },
          { sources: sourceFlowIOB, constants: constantsFlowIOB },
        ],
      }
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meABalanceIn = await erc20In.balanceOf(me.address);
    const meABalanceOut = await erc20Out.balanceOf(me.address);
    const youABalanceIn = await erc20In.balanceOf(you.address);
    const youABalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meABalanceIn.eq(await flowERC1155IO.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
        expected  ${flowERC1155IO.flow.erc20[0].amount}
        got       ${meABalanceIn}`
    );

    assert(
      meABalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
        expected  ${0}
        got       ${meABalanceOut}`
    );

    assert(
      youABalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
        expected  ${0}
        got       ${youABalanceIn}`
    );

    assert(
      youABalanceOut.eq(await flowERC1155IO.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
        expected  ${flowERC1155IO.flow.erc20[1].amount}
        got       ${youABalanceOut}`
    );

    // FlowB

    // Flow B
    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[1].evaluable, [1234], []);

    const meBBalanceIn = await erc20In.balanceOf(me.address);
    const meBBalanceOut = await erc20Out.balanceOf(me.address);
    const youBBalanceIn = await erc20In.balanceOf(you.address);
    const youBBalanceOut = await erc20Out.balanceOf(you.address);

    const expectedMeBBalance = ethers.BigNumber.from(
      await flowTransfer.erc20[0].amount
    ).mul(2);
    const expectedYouBBalance = ethers.BigNumber.from(
      await flowTransfer.erc20[1].amount
    ).mul(2);

    assert(
      meBBalanceIn.eq(expectedMeBBalance),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBBalance}
      got       ${meBBalanceIn}`
    );

    assert(
      meBBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBBalanceOut}`
    );

    assert(
      youBBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBBalanceIn}`
    );

    assert(
      youBBalanceOut.eq(expectedYouBBalance),
      `wrong balance for you (signer1 contract)
      expected  ${expectedYouBBalance}
      got       ${youBBalanceOut}`
    );
  });

  it("should utilize context in CAN_TRANSFER entrypoint", async () => {
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

    const flowERC1155IO: FlowERC1155IOV1Struct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };
    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
      sentinel1155: ${RAIN_FLOW_ERC1155_SENTINEL},
      you: context<0 0>(),
      me: context<0 1>(),

      flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token},
      flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
      flowtransfer-me-to-you-erc20-token:  ${flowTransfer.erc20[1].token},
      flowtransfer-me-to-you-erc20-base-amount: ${flowTransfer.erc20[1].amount},
      flowtransfer-me-to-you-erc20-bonus-amount: ${ethers.BigNumber.from(
        4 + eighteenZeros
      )},

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

      erc20-amount-1: if(greater-than(get(you) 0) flowtransfer-me-to-you-erc20-bonus-amount flowtransfer-me-to-you-erc20-base-amount),



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
      you: context<0 0>(),
      _: 1,
      /* Setting a value for msg.sender */
      /* This will only be set _afterTokenTransfer */
      : set(you block-number());
      `
    );
    const expressionConfigStruct = {
      sources,
      constants,
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
            sources: sourceFlowIO,
            constants: constantsFlowIO,
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

    // Ensure parties hold enough ERC721
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC1155(flowERC1155IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn0 = await erc20In.balanceOf(me.address);
    const meBalanceOut0 = await erc20Out.balanceOf(me.address);
    const youBalanceIn0 = await erc20In.balanceOf(you.address);
    const youBalanceOut0 = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn0.eq(flowStruct.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.erc20[0].amount}
      got       ${meBalanceIn0}`
    );

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

    assert(
      youBalanceOut0.eq(flowStruct.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.erc20[1].amount}
      got       ${youBalanceOut0}`
    );

    // Flowing for second time, this time a bonus amount should be transferred from contract to msg.sender
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(
      me.address,
      ethers.BigNumber.from(4 + eighteenZeros)
    );

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn1 = await erc20In.balanceOf(me.address);
    const meBalanceOut1 = await erc20Out.balanceOf(me.address);
    const youBalanceIn1 = await erc20In.balanceOf(you.address);
    const youBalanceOut1 = await erc20Out.balanceOf(you.address);

    const expectedMeBalanceIn = (
      flowERC1155IO.flow.erc20[0].amount as BigNumber
    ).mul(2);
    const expectedMeBalanceOut = meBalanceOut1.add(meBalanceOut0);

    assert(
      meBalanceIn1.eq(expectedMeBalanceIn),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalanceIn}
      got       ${meBalanceIn1}`
    );

    assert(
      meBalanceOut1.eq(expectedMeBalanceOut),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalanceOut}
      got       ${meBalanceOut1}`
    );

    assert(
      youBalanceIn1.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn1}`
    );

    assert(
      youBalanceOut1.eq(await ethers.BigNumber.from(4 + eighteenZeros)),
      `wrong balance for you (signer1 contract)
      expected  ${ethers.BigNumber.from(4 + eighteenZeros)}
      got       ${youBalanceOut1}`
    );
  });
});
