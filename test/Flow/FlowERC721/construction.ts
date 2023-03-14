import { assert } from "chai";
import { ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../typechain";

import {
  FlowERC721,
  InitializeEvent,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";
import {
  assertError,
  basicDeploy,
  getRainMetaDocumentFromContract,
  zeroAddress,
} from "../../../utils";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import { getTouchDeployer } from "../../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEventArgs } from "../../../utils/events";
import {
  MemoryType,
  standardEvaluableConfig,
} from "../../../utils/interpreter/interpreter";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC721Config } from "../../../utils/types/flow";
import { rainlang } from "../../../utils/extensions/rainlang";

describe("FlowERC721 construction tests", async function () {
  let cloneFactory: CloneFactory;
  let implementation: FlowERC721;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC721Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer] = signers;

    const constants = [1, 2];

    // prettier-ignore
    const { sources} = await standardEvaluableConfig(
      rainlang`
        /* sourceHandleTransfer */
        _: read-memory<0 ${MemoryType.Constant}>();
        
        /* sourceTokenURI */
        _: read-memory<0 ${MemoryType.Constant}>();
      `
    );

    const { sources: sourceFlowIO } = await standardEvaluableConfig(
      rainlang`
        /* variables */
        me: context<0 1>(),
        to: read-memory<1 ${MemoryType.Constant}>(),
        amount: read-memory<1 ${MemoryType.Constant}>(),
        seperator: read-memory<1 ${MemoryType.Constant}>(),
        
        /**
         * erc1155 transfers
         */
        transfererc1155slist: seperator,
        
        /**
         * erc721 transfers
         */
        transfererc721slist: seperator,
        
        /**
         * er20 transfers
         */
        transfererc20slist: seperator,
        
        /**
         * native (gas) token transfers
         */
        transfernativeslist: seperator,
          /* 0 */ 
          nativefrom0: me,
          nativeto0: to,
          nativeamount0: amount,
          /* 1 */ 
          nativefrom1: to,
          nativeto1: me,
          nativeamount1: amount,
        
        /**
         * burns of this erc721 token
         */
        burnslist: seperator,
        burnto: to,
        burnamount: amount,
        
        /**
         * mints of this erc721 token
         */
        mintslist: seperator,
        mintto: to,
        mintamount: amount;
      `
    );
    // const sources = [sourceHandleTransfer, sourceTokenURI];

    const flowERC721Config: FlowERC721Config = {
      name: "Flow ERC721",
      symbol: "F721",
      expressionConfig: {
        sources,
        constants,
      },
      flows: [
        {
          sources: sourceFlowIO,
          constants,
        },
      ],
      baseURI: "https://www.rainprotocol.xyz/nft/",
    };

    const { flow } = await flowERC721Clone(
      deployer,
      cloneFactory,
      implementation,
      flowERC721Config
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === cloneFactory.address, "wrong sender in Initialize event");

    compareStructs(config, flowERC721Config);
  });

  it("should fail if flowERC721 is deployed with bad callerMeta", async function () {
    const flowERC721Factory = await ethers.getContractFactory("FlowERC721", {});

    const touchDeployer: RainterpreterExpressionDeployer =
      await getTouchDeployer();

    const interpreterCallerConfig0: InterpreterCallerV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("flow721"),
        deployer: touchDeployer.address,
      };

    const flowERC721 = (await flowERC721Factory.deploy(
      interpreterCallerConfig0
    )) as FlowERC721;

    assert(!(flowERC721.address === zeroAddress), "flowERC721 did not deploy");

    const interpreterCallerConfig1: InterpreterCallerV1ConstructionConfigStruct =
      {
        meta: getRainMetaDocumentFromContract("orderbook"),
        deployer: touchDeployer.address,
      };

    await assertError(
      async () => await flowERC721Factory.deploy(interpreterCallerConfig1),
      "UnexpectedMetaHash",
      "FlowERC721 Deployed for bad hash"
    );
  });
});
