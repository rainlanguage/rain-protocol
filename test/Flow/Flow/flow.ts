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
  Flow, FlowTransferV1Struct, FlowTransferV1StructOutput,
  } from "../../../typechain/contracts/flow/basic/Flow";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { assertError } from "../../../utils";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
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
import { standardEvaluableConfig } from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

describe("Flow flow tests", async function () {
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
          from: "", // Contract address
          to: you.address,
        },
      ],
    };

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
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
      transfererc20slist: sentinel;
      
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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
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
      erc20-amount: flowtransfer-you-to-me-erc20-amount;

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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
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
        transfererc20slist: sentinel;
      
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

    const flowStruct: FlowTransferV1StructOutput = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    for (const erc1155Transfer of flowStruct.erc1155) {
      if (erc1155Transfer.to == me.address) {
        assert(
          meBalanceIn.eq(erc1155Transfer.amount),
          `wrong balance for me (flow contract)
          expected  ${erc1155Transfer.amount}
          got       ${meBalanceIn}`
        );
      } else if (erc1155Transfer.to == you.address) {
        assert(
          youBalanceOut.eq(erc1155Transfer.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc1155Transfer.amount}
          got       ${youBalanceOut}`
        );
      }
    }

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
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
        transfererc20slist: sentinel;

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

    // Ensure parties hold ERC721 tokens
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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
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
        erc20-amount-1: flowtransfer-me-to-you-erc20-amount;
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

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer of flowStruct.erc20) {
      if (erc20Transfer.to == me.address) {
        assert(
          meBalanceIn.eq(erc20Transfer.amount),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer.amount}
          got       ${meBalanceIn}`
        );
      } else if (erc20Transfer.to == you.address) {
        assert(
          youBalanceOut.eq(erc20Transfer.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer.amount}
          got       ${youBalanceOut}`
        );
      }
    }

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
  });

  it("should error if ERC20 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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

    const { sources: sourceFlowIOIn, constants: constantsFlowIOIn } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        bob: ${bob.address},
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
        erc20-from-0: bob,
        erc20-to-0: me,
        erc20-amount-0: flowtransfer-you-to-me-erc20-amount,
        /* 1 */
        erc20-token-1: flowtransfer-me-to-you-erc20-token,
        erc20-from-1: me,
        erc20-to-1: you,
        erc20-amount-1: flowtransfer-me-to-you-erc20-amount;

      `
      );

    const { sources: sourceFlowIOOut, constants: constantsFlowIOOut } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        bob: ${bob.address},
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
        erc20-from-1: bob,
        erc20-to-1: you,
        erc20-amount-1: flowtransfer-me-to-you-erc20-amount;

      `
      );

    const flowConfigStruct: FlowConfig = {
      flows: [
        { sources: sourceFlowIOIn, constants: constantsFlowIOIn },
        { sources: sourceFlowIOOut, constants: constantsFlowIOOut },
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

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const dispatchIN = flowInitialized[0].evaluable;
    const dispatchOUT = flowInitialized[1].evaluable;

    await assertError(
      async () => await flow.connect(you).flow(dispatchIN, [1234], []),
      "UnsupportedERC20Flow()",
      "Flowed an unsupported ERC20 Flow"
    );

    await assertError(
      async () => await flow.connect(you).flow(dispatchOUT, [1234], []),
      "UnsupportedERC20Flow()",
      "Flowed an unsupported ERC20 Flow"
    );
  });

  it("should error if ERC721 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        bob: ${bob.address},
        
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
        erc721-from-0: bob,
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
        transfererc20slist: sentinel;

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

    // Ensure parties hold ERC721 tokens
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

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "UnsupportedERC721Flow()",
      "Flowed an unsupported ERC721 Flow"
    );
  });

  it("should error if ERC1155 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        bob: ${bob.address},
        
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
        erc1155-from-0: bob,
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
        transfererc20slist: sentinel;
        
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

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "UnsupportedERC1155Flow()",
      "Flowed an unsupported ERC1155 Flow"
    );
  });

  it("should error if the flow being evaluated is unregistered", async () => {
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

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
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
        erc20-amount-1: flowtransfer-me-to-you-erc20-amount;

      `
      );

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: sourceFlowIO, constants: constantsFlowIO }],
    };

    // Deploying flow 0
    let { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized0 = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    // Deploying flow 1
    ({ flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    ));

    await assertError(
      async () =>
        await flow
          .connect(you)
          .previewFlow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );

    await assertError(
      async () =>
        await flow
          .connect(you)
          .callStatic.flow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );
  });

  it("should not be able to access values set in a flow across different flows", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const { sources: sourceFlowIOA, constants: constantsFlowIOA } =
      await standardEvaluableConfig(
        rainlang`
        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        key: 1337,

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

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,
        /* 0 */
        erc20-token-0: flowtransfer-you-to-me-erc20-token,
        erc20-from-0: you,
        erc20-to-0: me,
        erc20-amount-0: flowtransfer-you-to-me-erc20-amount,

        : set(key block-timestamp()); 
      `
      );

    const { sources: sourceFlowIOB, constants: constantsFlowIOB } =
      await standardEvaluableConfig(
        rainlang`
      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
      you: context<0 0>(),
      me: context<0 1>(),
      key: 1337,

      flowtransfer-you-to-me-erc20-token:  ${flowTransfer.erc20[0].token}, 
      flowtransfer-you-to-me-erc20-amount: ${flowTransfer.erc20[0].amount},
      
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
      erc20-amount-0: flowtransfer-you-to-me-erc20-amount;

    `
      );
    const flowConfigStruct: FlowConfig = {
      flows: [
        { sources: sourceFlowIOA, constants: constantsFlowIOA },
        { sources: sourceFlowIOB, constants: constantsFlowIOB },
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

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // Transfer flowB

    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);
    await flow.connect(you).flow(flowInitialized[1].evaluable, [1234], []);

    // check input ERC20 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(
      me20BalanceIn.eq(
        ((await flowTransfer.erc20[0].amount) as BigNumber).mul(2)
      )
    );
    assert(you20BalanceIn.isZero());
  });
});
