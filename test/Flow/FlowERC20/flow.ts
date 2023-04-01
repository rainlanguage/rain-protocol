import { assert } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import {
  FlowERC20,
  FlowERC20IOStruct,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowCloneFactory } from "../../../utils/deploy/factory/cloneFactory";

import {
  flowERC20Clone,
  flowERC20Implementation,
} from "../../../utils/deploy/flow/flowERC20/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { rainlang } from "../../../utils/extensions/rainlang";
import { fillEmptyAddressERC20 } from "../../../utils/flow";
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC20Config } from "../../../utils/types/flow";

describe("FlowERC20 flow tests", async function () {
  let implementation: FlowERC20;
  let cloneFactory: CloneFactory;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC20Implementation();

    //Deploy Clone Factory
    cloneFactory = await flowCloneFactory();
  });

  it("should support transferPreflight hook", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(2),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(0),
        },
      ],
      flow: flowTransfer,
    };

    const mint = flowERC20IO.mints[0].amount;
    const burn = flowERC20IO.burns[0].amount;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        mintamount: ${mint},
        burnamount: ${burn},

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
         * native (gas) token transfers
         */
        transfernativeslist: sentinel,
        
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
         */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources: sourceCanTransfer, constants: constantsCanTransfer } =
      await standardEvaluableConfig(
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

    const expressionConfigStructCanTransfer: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
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
    const expressionConfigStructCannotTransfer: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
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

    const { flow: flowCanTransfer } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStructCanTransfer
    );
    const { flow: flowCannotTransfer } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStructCannotTransfer
    );

    const flowInitializedCanTransfer = (await getEvents(
      flowCanTransfer.deployTransaction,
      "FlowInitialized",
      flowCanTransfer
    )) as FlowInitializedEvent["args"][];

    const flowExpressionsCannotTransfer = (await getEvents(
      flowCannotTransfer.deployTransaction,
      "FlowInitialized",
      flowCannotTransfer
    )) as FlowInitializedEvent["args"][];

    const signerReceiver = signers[2];
    const _txFlowCanTransfer = await flowCanTransfer
      .connect(you)
      .flow(flowInitializedCanTransfer[0].evaluable, [1234], []);

    const _txFlowCannotTransfer = await flowCannotTransfer
      .connect(you)
      .flow(flowExpressionsCannotTransfer[0].evaluable, [1234], []);

    await flowCanTransfer.connect(you).transfer(signerReceiver.address, mint);

    await assertError(
      async () =>
        await flowCannotTransfer
          .connect(you)
          .transfer(signerReceiver.address, mint),
      "InvalidTransfer()",
      "transferred when it should not"
    );
  });

  it("should mint and burn tokens per flow in exchange for another token (e.g. native)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const flowTransferMint: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(0),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };
    const flowTransferBurn: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(0),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    // for mint flow (redeem native for erc20)
    const mintMint = ethers.BigNumber.from(2 + eighteenZeros);
    const burnMint = ethers.BigNumber.from(0);

    const flowERC20IOMint: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: mintMint,
        },
      ],
      burns: [
        {
          account: you.address,
          amount: burnMint,
        },
      ],
      flow: flowTransferMint,
    };

    // for burn flow (redeem erc20 for native)
    const mintBurn = ethers.BigNumber.from(0);
    const burnBurn = ethers.BigNumber.from(2 + eighteenZeros);

    const flowERC20IOBurn: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: mintBurn,
        },
      ],
      burns: [
        {
          account: you.address,
          amount: burnBurn,
        },
      ],
      flow: flowTransferBurn,
    };

    const { sources: sourceFlowIOMint, constants: constantsFlowIOMint } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        flowio-input-native-amount: ${flowERC20IOMint.flow.native[0].amount},
        flowio-output-native-amount: ${flowERC20IOMint.flow.native[1].amount},
        mintamount: ${mintMint},
        burnamount: ${burnMint},

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
          /* 0 */
          native-from-0 native-to-0 native-amount-0: you me flowio-input-native-amount,
          /* 1 */
          native-from-1 native-to-1 native-amount-1: me you flowio-output-native-amount,
        
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,

        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources: sourceFlowIOBurn, constants: constantsFlowIOBurn } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        flowio-input-native-amount: ${flowERC20IOBurn.flow.native[0].amount},
        flowio-output-native-amount: ${flowERC20IOBurn.flow.native[1].amount},
        mintamount: ${mintBurn},
        burnamount: ${burnBurn},

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
          /* 0 */
          native-from-0 native-to-0 native-amount-0: you me flowio-input-native-amount,
          /* 1 */
          native-from-1 native-to-1 native-amount-1: me you flowio-output-native-amount,
        
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,

        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    // prettier-ignore
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
      `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants, // only needed for REBASE_RATIO and CAN_TRANSFER, so could also be `constantsBurn` and produce same result
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

    const { flow } = await flowERC20Clone(
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

    const totalSupply0 = await flow.totalSupply();
    assert(
      totalSupply0.isZero(),
      "should not have minted any tokens before calling flow that mints"
    );

    // prepare input Ether
    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, [1234], [], {
        value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
      });

    compareStructs(
      flowStructMint,
      fillEmptyAddressERC20(flowERC20IOMint, flow.address)
    );

    const txFlowMint = await flow.connect(you).flow(mintFlowId, [1234], [], {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlowMint.wait();
    const { gasPrice } = txFlowMint;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youEtherBalance0
      .sub(flowTransferMint.native[0].amount as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowTransferMint.native[0]
      .amount as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const totalSupply1 = await flow.totalSupply();

    assert(me20Balance1.isZero());
    assert(
      you20Balance1.eq(mintMint),
      `wrong sender balance minted
      expected  ${mintMint}
      got       ${you20Balance1}`
    );
    assert(totalSupply1.eq(mintMint));

    // -- PERFORM BURN --

    const flowStructBurn = await flow
      .connect(you)
      .callStatic.flow(burnFlowId, [1234], []);

    compareStructs(
      flowStructBurn,
      fillEmptyAddressERC20(flowERC20IOBurn, flow.address)
    );

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, [1234], []);

    const { gasUsed: gasUsedBurn } = await txFlowBurn.wait();
    const { gasPrice: gasPriceBurn } = txFlowBurn;

    const youEtherBalance2 = await ethers.provider.getBalance(you.address);
    const meEtherBalance2 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance2 = youEtherBalance1
      .add(flowTransferBurn.native[1].amount as BigNumber)
      .sub(gasUsedBurn.mul(gasPriceBurn));

    assert(
      youEtherBalance2.eq(expectedYouEtherBalance2),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance2}
      got       ${youEtherBalance2}`
    );

    assert(
      meEtherBalance2.isZero(),
      `wrong balance for me (flow contract)
      expected  0
      got       ${meEtherBalance2}`
    );

    const me20Balance2 = await flow.balanceOf(me.address);
    const you20Balance2 = await flow.balanceOf(you.address);
    const totalSupply2 = await flow.totalSupply();

    assert(me20Balance2.isZero());
    assert(
      you20Balance2.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you20Balance2}`
    );
    assert(totalSupply2.isZero());
  });

  it("should flow for erc1155<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc1155In = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155In.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(0),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
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
      ],
    };

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},

        flowtransfer-you-to-me-erc1155-token:  ${flowTransfer.erc1155[0].token},
        flowtransfer-you-to-me-erc1155-id: ${flowTransfer.erc1155[0].id},
        flowtransfer-you-to-me-erc1155-amount: ${flowTransfer.erc1155[0].amount},
        flowtransfer-you-to-me-native-amount: ${flowTransfer.native[0].amount},
        flowtransfer-me-to-you-native-amount: ${flowTransfer.native[1].amount},
        
        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,
        /* 0 */
        erc1155-token: flowtransfer-you-to-me-erc1155-token,
        erc1155-from: you,
        erc1155-to: me,
        erc1155-id: flowtransfer-you-to-me-erc1155-id,
        erc1155-amount: flowtransfer-you-to-me-erc1155-amount,
      
        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,
        
        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,
        
        /**
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        /* 0 */
        native-from-0 native-to-0 native-amount-0: you me flowtransfer-you-to-me-native-amount,
        /* 1 */
        native-from-1 native-to-1 native-amount-1: me you flowtransfer-me-to-you-native-amount,
        
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // prepare output Ether

    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    // prepare input ERC1155

    await erc1155In.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // check input ERC1155 affected balances correctly

    const me1155BalanceIn = await erc1155In.balanceOf(
      me.address,
      flowTransfer.erc1155[0].id
    );
    const you1155BalanceIn = await erc1155In.balanceOf(
      you.address,
      flowTransfer.erc1155[0].id
    );

    assert(me1155BalanceIn.eq(flowTransfer.erc1155[0].amount as BigNumber));
    assert(you1155BalanceIn.isZero());

    // check output Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const meEtherBalanceOut = await ethers.provider.getBalance(me.address);
    const youEtherBalanceOut = await ethers.provider.getBalance(you.address);

    const expectedYouEtherBalanceOut = youEtherBalance0
      .add(flowTransfer.native[1].amount as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(meEtherBalanceOut.isZero());
    assert(
      youEtherBalanceOut.eq(expectedYouEtherBalanceOut),
      `wrong balance
      expected  ${expectedYouEtherBalanceOut}
      got       ${youEtherBalanceOut}`
    );
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

    const flowTransfer: FlowTransferStruct = {
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},
        
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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
          /* sourceHandleTransfer */
          _: 1;
          `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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
      fillEmptyAddressERC20(flowERC20IO, flow.address)
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

    const flowTransfer: FlowTransferStruct = {
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
         /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[0].id
    );

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // check input ERC20 affected balances correctly
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

  it("should flow for native<->erc20 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
      ],
      erc20: [
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},

        flowtransfer-me-to-you-erc20-token:  ${flowTransfer.erc20[0].token}, 
        flowtransfer-me-to-you-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-you-to-me-native-amount: ${flowTransfer.native[0].amount},
        
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
        erc20-token: flowtransfer-me-to-you-erc20-token,
        erc20-from: me,
        erc20-to: you,
        erc20-amount: flowtransfer-me-to-you-erc20-amount,

        /**
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        native-from: you,
        native-to: me,
        native-amount: flowtransfer-you-to-me-native-amount,

       /**
         * burns of this erc20 token
         */
       burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
          /* sourceHandleTransfer */
          _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // prepare output ERC20
    await erc20Out.transfer(me.address, flowTransfer.erc20[0].amount);

    // prepare input Ether
    const youBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youBalance0
      .sub(flowTransfer.native[0].amount as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowTransfer.native[0].amount as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    // check output ERC20 affected balances correctly
    const me20Balance1 = await erc20Out.balanceOf(me.address);
    const you20Balance1 = await erc20Out.balanceOf(you.address);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(flowTransfer.erc20[0].amount as BigNumber));
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

    const flowTransfer: FlowTransferStruct = {
      native: [],
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
       
         /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
          /* sourceHandleTransfer */
          _: 1;
          `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(await flowERC20IO.flow.erc1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC20IO.flow.erc1155[0].amount}
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
      youBalanceOut.eq(await flowERC20IO.flow.erc1155[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC20IO.flow.erc1155[1].amount}
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

    const flowTransfer: FlowTransferStruct = {
      native: [],
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount},

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        
       /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // Ensure parties hold erc20 tokens
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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount}, 

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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
     
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(await flowERC20IO.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC20IO.flow.erc20[0].amount}
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
      youBalanceOut.eq(await flowERC20IO.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC20IO.flow.erc20[1].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for native<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount}, 

        flowtransfer-you-to-me-native-amount: ${flowTransfer.native[0].amount},
        flowtransfer-me-to-you-native-amount: ${flowTransfer.native[1].amount},
        
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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
        /* 0 */
        native-from-0: you,
        native-to-0: me,
        native-amount-0: flowtransfer-you-to-me-native-amount,
        /* 1 */
        native-from-1: me,
        native-to-1: you,
        native-amount-1: flowtransfer-me-to-you-native-amount,

        /**
       * burns of this erc20 token
       */
        burnslist: sentinel20,
        burn-account burn-amount: you burnamount,
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20,
        mint-account mint-amount: you mintamount;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    const youBalance0 = await ethers.provider.getBalance(you.address);
    const meBalance0 = await ethers.provider.getBalance(me.address);

    assert(meBalance0.eq(await flowTransfer.native[1].amount));

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youBalance1 = await ethers.provider.getBalance(you.address);
    const meBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouBalance1 = youBalance0
      .sub(await flowTransfer.native[0].amount)
      .add(await flowTransfer.native[1].amount)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youBalance1.eq(expectedYouBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouBalance1}
      got       ${youBalance1}`
    );

    const expectedMeBalance1 = meBalance0
      .add(await flowTransfer.native[0].amount)
      .sub(await flowTransfer.native[1].amount);

    assert(
      meBalance1.eq(expectedMeBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalance1}
      got       ${meBalance1}`
    );
  });

  it("should receive Ether", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        
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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,

        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20;
      `
      );

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
          /* sourceHandleTransfer */
          _: 1;
          `
    );

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      expressionConfigStruct
    );

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(ethers.BigNumber.from(1 + sixZeros)),
    });
  });

  it("should not be able to access values set in a flow across different flows", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    // Sample key
    const key = 1337;

    const { sources: sourceFlowIOA, constants: constantsFlowIOA } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
      sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
      you: context<0 0>(),
      me: context<0 1>(),
      key: ${key},
      flowtransfer-you-to-me-native-amount: ${flowTransfer.native[0].amount},
      flowtransfer-me-to-you-native-amount: ${flowTransfer.native[1].amount},
      
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
       * native (gas) token transfers
      */
      transfernativeslist: sentinel,
      /* 0 */
      native-from-0: you,
      native-to-0: me,
      native-amount-0: flowtransfer-you-to-me-native-amount,
      /* 1 */
      native-from-1: me,
      native-to-1: you,
      native-amount-1: flowtransfer-me-to-you-native-amount,

      /**
       * burns of this erc20 token
       */
      burnslist: sentinel20,
      
      /**
       * mints of this erc20 token
      */
      mintslist: sentinel20,
      
      /* Setting a value */
      : set(key block-timestamp());
    `
      );

    const { sources: sourceFlowIOB, constants: constantsFlowIOB } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
      sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
      you: context<0 0>(),
      me: context<0 1>(),
      key: ${key},
      flowtransfer-you-to-me-native-amount: ${flowTransfer.native[0].amount},
      flowtransfer-me-to-you-native-amount: ${flowTransfer.native[1].amount},
      
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

      /**
       * native (gas) token transfers
      */
      transfernativeslist: sentinel,
      /* 0 */
      native-from-0: you,
      native-to-0: me,
      native-amount-0: flowtransfer-you-to-me-native-amount,
      /* 1 */
      native-from-1: me,
      native-to-1: you,
      native-amount-1: flowtransfer-me-to-you-native-amount,

      /**
       * burns of this erc20 token
       */
      burnslist: sentinel20,
      
      /**
       * mints of this erc20 token
      */
      mintslist: sentinel20,
      
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

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [
        { sources: sourceFlowIOA, constants: constantsFlowIOA },
        { sources: sourceFlowIOB, constants: constantsFlowIOB },
      ],
    };

    const { flow } = await flowERC20Clone(
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

    const me = flow;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    const youBalance0 = await ethers.provider.getBalance(you.address);
    let meBalance0 = await ethers.provider.getBalance(me.address);

    assert(meBalance0.eq(await flowTransfer.native[1].amount));

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youBalance1 = await ethers.provider.getBalance(you.address);
    const meBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouBalance1 = youBalance0
      .sub(await flowTransfer.native[0].amount)
      .add(await flowTransfer.native[1].amount)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youBalance1.eq(expectedYouBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouBalance1}
      got       ${youBalance1}`
    );

    const expectedMeBalance1 = meBalance0
      .add(await flowTransfer.native[0].amount)
      .sub(await flowTransfer.native[1].amount);

    assert(
      meBalance1.eq(expectedMeBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalance1}
      got       ${meBalance1}`
    );

    // Flow B
    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    meBalance0 = await ethers.provider.getBalance(me.address);

    await flow.connect(you).flow(flowInitialized[1].evaluable, [1234], [], {
      value: ethers.BigNumber.from(flowTransfer.native[0].amount),
    });

    const meBalance2 = await ethers.provider.getBalance(me.address);

    const expectedMeBalance2 = meBalance0
      .add(await flowTransfer.native[0].amount)
      .sub(await flowTransfer.native[1].amount);

    assert(
      meBalance2.eq(expectedMeBalance2),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalance2}
      got       ${meBalance2}`
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

    const flowERC20IO: FlowERC20IOStruct = {
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
      flow: flowTransfer,
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        
        flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token}, 
        flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
        flowtransfer-me-to-you-erc20-token:  ${flowTransfer.erc20[1].token}, 
        flowtransfer-me-to-you-erc20-base-amount: ${
          flowTransfer.erc20[1].amount
        },
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
         * native (gas) token transfers
        */
        transfernativeslist: sentinel,
     
        /**
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        
        /**
         * mints of this erc20 token
        */
        mintslist: sentinel20;
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

    const expressionConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "F20",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    const { flow } = await flowERC20Clone(
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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn0 = await erc20In.balanceOf(me.address);
    const meBalanceOut0 = await erc20Out.balanceOf(me.address);
    const youBalanceIn0 = await erc20In.balanceOf(you.address);
    const youBalanceOut0 = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn0.eq(await flowERC20IO.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC20IO.flow.erc20[0].amount}
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
      youBalanceOut0.eq(await flowERC20IO.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC20IO.flow.erc20[1].amount}
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
      flowERC20IO.flow.erc20[0].amount as BigNumber
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
