import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC20,
  FlowERC20IOV1Struct,
  FlowTransferV1Struct,
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
import {
  opMetaHash,
  standardEvaluableConfig,
} from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("FlowERC20 previewFlow tests", async function () {
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

  it("should preview defined flow IO for ERC1155 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc1155A = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155A.initialize();
    const erc1155B = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155B.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155A.address,
          id: 1,
          amount: 2,
        },
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155B.address,
          id: 3,
          amount: 4,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155A.address,
          id: 5,
          amount: 6,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155B.address,
          id: 7,
          amount: 8,
        },
      ],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

      /* variables */
      sentinel: ${RAIN_FLOW_SENTINEL},
      sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
      you: context<0 0>(),
      me: context<0 1>(),
      burnamount: ${flowERC20IO.burns[0].amount},
      mintamount: ${flowERC20IO.mints[0].amount}, 

      flowtransfer-you-to-me-erc1155-token-a:  ${flowTransfer.erc1155[0].token},
      flowtransfer-you-to-me-erc1155-id-a: ${flowTransfer.erc1155[0].id},
      flowtransfer-you-to-me-erc1155-amount-a: ${flowTransfer.erc1155[0].amount},
      
      flowtransfer-you-to-me-erc1155-token-b:  ${flowTransfer.erc1155[1].token},
      flowtransfer-you-to-me-erc1155-id-b: ${flowTransfer.erc1155[1].id},
      flowtransfer-you-to-me-erc1155-amount-b: ${flowTransfer.erc1155[1].amount},
      
      flowtransfer-me-to-you-erc1155-token-a:  ${flowTransfer.erc1155[2].token},
      flowtransfer-me-to-you-erc1155-id-a: ${flowTransfer.erc1155[2].id},
      flowtransfer-me-to-you-erc1155-amount-a: ${flowTransfer.erc1155[2].amount},
    
      flowtransfer-me-to-you-erc1155-token-b:  ${flowTransfer.erc1155[3].token},
      flowtransfer-me-to-you-erc1155-id-b: ${flowTransfer.erc1155[3].id},
      flowtransfer-me-to-you-erc1155-amount-b: ${flowTransfer.erc1155[3].amount},
      
      /**
       * erc1155 transfers
       */
      transfererc1155slist: sentinel,
      /* 0 */
      erc1155-token-0: flowtransfer-you-to-me-erc1155-token-a,
      erc1155-from-0: you,
      erc1155-to-0: me,
      erc1155-id-0: flowtransfer-you-to-me-erc1155-id-a,
      erc1155-amount-0: flowtransfer-you-to-me-erc1155-amount-a,
      /* 1 */
      erc1155-token-1: flowtransfer-you-to-me-erc1155-token-b,
      erc1155-from-1: you,
      erc1155-to-1: me,
      erc1155-id-1: flowtransfer-you-to-me-erc1155-id-b,
      erc1155-amount-1: flowtransfer-you-to-me-erc1155-amount-b,
      /* 2 */
      erc1155-token-2: flowtransfer-me-to-you-erc1155-token-a,
      erc1155-from-2: me,
      erc1155-to-2: you,
      erc1155-id-2: flowtransfer-me-to-you-erc1155-id-a,
      erc1155-amount-2: flowtransfer-me-to-you-erc1155-amount-a,
      /* 3 */
      erc1155-token-3: flowtransfer-me-to-you-erc1155-token-b,
      erc1155-from-3: me,
      erc1155-to-3: you,
      erc1155-id-3: flowtransfer-me-to-you-erc1155-id-b,
      erc1155-amount-3: flowtransfer-me-to-you-erc1155-amount-b,
    
      /**
       * erc721 transfers
       */
      transfererc721slist: sentinel,
      
      /**
       * er20 transfers
       */
      transfererc20slist: sentinel,
      
      
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
        @${opMetaHash}

      /* sourceHandleTransfer */
      _: 1;
      `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);
    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC721 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc721A = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721A.initialize();
    const erc721B = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721B.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [
        {
          token: erc721A.address,
          from: you.address,
          to: "", // Contract Address
          id: 1,
        },
        {
          token: erc721B.address,
          from: you.address,
          to: "", // Contract Address
          id: 2,
        },
        {
          token: erc721A.address,
          from: "", // Contract Address
          to: you.address,
          id: 3,
        },
        {
          token: erc721B.address,
          from: "", // Contract Address
          to: you.address,
          id: 4,
        },
      ],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount}, 

        flowtransfer-you-to-me-erc721-token-a: ${flowTransfer.erc721[0].token},
        flowtransfer-you-to-me-erc721-id-a: ${flowTransfer.erc721[0].id},
       
        flowtransfer-you-to-me-erc721-token-b: ${flowTransfer.erc721[1].token},
        flowtransfer-you-to-me-erc721-id-b: ${flowTransfer.erc721[1].id},
        
        flowtransfer-me-to-you-erc721-token-a: ${flowTransfer.erc721[2].token},
        flowtransfer-me-to-you-erc721-id-a: ${flowTransfer.erc721[2].id},
        
        flowtransfer-me-to-you-erc721-token-b: ${flowTransfer.erc721[3].token},
        flowtransfer-me-to-you-erc721-id-b: ${flowTransfer.erc721[3].id},
        
        /**
         * erc1155 transfers
         */
        transfererc1155slist: sentinel,
      
        /**
         * erc721 transfers
         */
        transfererc721slist: sentinel,
        /* 0 */
        erc721-token-0: flowtransfer-you-to-me-erc721-token-a,
        erc721-from-0: you,
        erc721-to-0: me,
        erc721-id-0: flowtransfer-you-to-me-erc721-id-a,
        /* 1 */
        erc721-token-1: flowtransfer-you-to-me-erc721-token-b,
        erc721-from-1: you,
        erc721-to-1: me,
        erc721-id-1: flowtransfer-you-to-me-erc721-id-b,
        /* 2 */
        erc721-token-2: flowtransfer-me-to-you-erc721-token-a,
        erc721-from-2: me,
        erc721-to-2: you,
        erc721-id-2: flowtransfer-me-to-you-erc721-id-a,
        /* 3 */
        erc721-token-3: flowtransfer-me-to-you-erc721-token-b,
        erc721-from-3: me,
        erc721-to-3: you,
        erc721-id-3: flowtransfer-me-to-you-erc721-id-b,

        /**
         * er20 transfers
         */
        transfererc20slist: sentinel,

        
        
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
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;
        `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);
    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC20 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20A = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20A.initialize();
    const erc20B = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20B.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20A.address,
          amount: 1,
        },
        {
          from: you.address,
          to: "", // Contract address
          token: erc20B.address,
          amount: 2,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20A.address,
          amount: 3,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20B.address,
          amount: 4,
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        you: context<0 0>(),
        me: context<0 1>(),
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount}, 

        flowtransfer-you-to-me-erc20-token-a:  ${flowTransfer.erc20[0].token}, 
        flowtransfer-you-to-me-erc20-amount-a: ${flowTransfer.erc20[0].amount},
        flowtransfer-you-to-me-erc20-token-b:  ${flowTransfer.erc20[1].token}, 
        flowtransfer-you-to-me-erc20-amount-b: ${flowTransfer.erc20[1].amount},
        flowtransfer-me-to-you-erc20-token-a:  ${flowTransfer.erc20[2].token}, 
        flowtransfer-me-to-you-erc20-amount-a: ${flowTransfer.erc20[2].amount},
        flowtransfer-me-to-you-erc20-token-b:  ${flowTransfer.erc20[3].token}, 
        flowtransfer-me-to-you-erc20-amount-b: ${flowTransfer.erc20[3].amount},
        
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
        erc20-token-0: flowtransfer-you-to-me-erc20-token-a,
        erc20-from-0: you,
        erc20-to-0: me,
        erc20-amount-0: flowtransfer-you-to-me-erc20-amount-a,
        /* 1 */
        erc20-token-1: flowtransfer-you-to-me-erc20-token-b,
        erc20-from-1: you,
        erc20-to-1: me,
        erc20-amount-1: flowtransfer-you-to-me-erc20-amount-b,
        /* 2 */
        erc20-token-2: flowtransfer-me-to-you-erc20-token-a,
        erc20-from-2: me,
        erc20-to-2: you,
        erc20-amount-2: flowtransfer-me-to-you-erc20-amount-a,
        /* 3 */
        erc20-token-3: flowtransfer-me-to-you-erc20-token-b,
        erc20-from-3: me,
        erc20-to-3: you,
        erc20-amount-3: flowtransfer-me-to-you-erc20-amount-b,

        
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
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;
        
        /* sourceTokenURI */
        _: 1;
        `
    );
    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);
    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC1155 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc1155 = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155.address,
          id: 1,
          amount: 2,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155.address,
          id: 3,
          amount: 4,
        },
      ],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

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
        @${opMetaHash}

      /* sourceHandleTransfer */
      _: 1;
      
      /* sourceTokenURI */
      _: 1;
      `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );
  });

  it("should preview defined flow IO for ERC721 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [
        {
          token: erc721.address,
          from: you.address,
          to: "", // Contract Address
          id: 1,
        },
        {
          token: erc721.address,
          from: "", // Contract Address
          to: you.address,
          id: 2,
        },
      ],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

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
        @${opMetaHash}

      /* sourceHandleTransfer */
      _: 1;
      `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );
  });

  it("should preview defined flow IO for ERC20 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20.initialize();

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20.address,
          amount: 1,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20.address,
          amount: 3,
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

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
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;
        `
    );
    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );
  });

  it("should not flow if it does not meet 'ensure' requirement", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const { sources: sourceFlowIO, constants: constantsFlowIO } =
      await standardEvaluableConfig(
        rainlang`
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        
        /* failing deliberately */
        : ensure(0),

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
         * burns of this erc20 token
         */
        burnslist: sentinel20,
        
        /**
         * mints of this erc20 token
         */
        mintslist: sentinel20;
      `
      );

    // prettier-ignore
    const { sources, constants} = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;
      `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    await assertError(
      async () =>
        await flow.previewFlow(flowInitialized[0].evaluable, [1234], []),
      "",
      "flowed when it should not"
    );
  });

  it("should preview empty flow io", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const flowTransfer: FlowTransferV1Struct = {
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOV1Struct = {
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
        @${opMetaHash}

        /* variables */
        sentinel: ${RAIN_FLOW_SENTINEL},
        sentinel20: ${RAIN_FLOW_ERC20_SENTINEL},
        burnamount: ${flowERC20IO.burns[0].amount},
        mintamount: ${flowERC20IO.mints[0].amount}, 
        you: context<0 0>(),
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
        @${opMetaHash}

        /* sourceHandleTransfer */
        _: 1;
      `
    );

    const expressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC20Clone(
      deployer,
      cloneFactory,
      implementation,
      {
        name: "FlowERC20",
        symbol: "F20",
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

    const flowERC20IOPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);
    compareStructs(
      flowERC20IOPreview,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );
  });
});
