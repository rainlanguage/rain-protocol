import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { CloneFactory } from "../../../typechain";
import {
  FlowERC721,
  FlowERC721IOStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import {
  flowERC721Clone,
  flowERC721Implementation,
} from "../../../utils/deploy/flow/flowERC721/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC721 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowERC721Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC721 tokenURI test", async function () {
  let cloneFactory: CloneFactory;
  let implementation: FlowERC721;
  const ME = () => op(Opcode.context, 0x0001); // base context this
  const YOU = () => op(Opcode.context, 0x0000); // base context sender

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowERC721Implementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should generate tokenURI based on the expression result", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];
    const bob = signers[2];

    const tokenId = 0;

    const flowERC721IOMint: FlowERC721IOStruct = {
      mints: [
        {
          account: you.address,
          id: tokenId,
        },
      ],
      burns: [],
      flow: {
        native: [],
        erc20: [],
        erc721: [],
        erc1155: [],
      },
    };

    const flowERC721IOBurn: FlowERC721IOStruct = {
      mints: [],
      burns: [
        {
          account: you.address,
          id: tokenId,
        },
      ],
      flow: {
        native: [],
        erc20: [],
        erc721: [],
        erc1155: [],
      },
    };

    // for mint flow (redeem native for erc20)
    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowERC721IOMint.mints[0].id,
    ];
    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowERC721IOBurn.burns[0].id,
      bob.address,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1));
    const HANDLE_TRANSFER = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));

    const TOKEN_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const BOB = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));

    const TOKEN_URI_TOKEN_ID = () => op(Opcode.context, 0x0100);

    // Script to generate token URI only if the requesting user is the owner of provided NFT ID
    // prettier-ignore
    const sourceTokenURI = concat([
                ME(),
                TOKEN_URI_TOKEN_ID(),
            op(Opcode.erc_721_owner_of), // returns the owner of requesting TOKEN_URI_TOKEN_ID
            YOU(),
            op(Opcode.equal_to),
        op(Opcode.ensure, 1),
        TOKEN_URI_TOKEN_ID()
    ]);

    const sourceFlowIOMint = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      SENTINEL_721(),
      SENTINEL_721(),
      YOU(),
      TOKEN_ID(), // mint
    ]);

    const sourceFlowIOBurn = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      SENTINEL_721(),
      BOB(),
      TOKEN_ID(), // burn
      SENTINEL_721(),
    ]);

    const sources = [HANDLE_TRANSFER(), sourceTokenURI];

    const stateConfigStruct: FlowERC721Config = {
      baseURI: "https://www.rainprotocol.xyz/nft/",
      name: "FlowERC721",
      symbol: "F721",
      expressionConfig: {
        sources,
        constants: constantsMint, // only needed for HANDLE_TRANSFER
      },
      flows: [
        {
          sources: [sourceFlowIOMint],
          constants: constantsMint,
        },
        {
          sources: [sourceFlowIOBurn],
          constants: constantsBurn,
        },
      ],
    };

    const { flow } = await flowERC721Clone(
      deployer,
      cloneFactory,
      implementation,
      stateConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const mintFlowId = flowInitialized[0].evaluable;

    const me = flow;

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, [1234], []);

    compareStructs(
      flowStructMint,
      fillEmptyAddressERC721(flowERC721IOMint, flow.address)
    );

    await flow.connect(you).flow(mintFlowId, [1234], []);

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const owner1 = await flow.ownerOf(tokenId);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(1));
    assert(owner1 === you.address);

    // Asserting tokenURI
    const tokenURI = await flow.connect(you).tokenURI(tokenId);
    const expectedTokenURI = stateConfigStruct.baseURI + tokenId;
    assert(
      tokenURI === expectedTokenURI,
      `Invalid token URI
        expected : ${expectedTokenURI}
        actual: ${tokenURI}`
    );

    // Should error if the caller is not the owner of tokenID
    await assertError(
      async () => await flow.connect(bob).tokenURI(tokenId),
      "Error: call revert exception",
      "Did not error when the caller is not the owner of given tokenID"
    );
  });
});
