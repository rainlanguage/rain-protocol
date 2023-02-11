import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain";
import { ReserveToken, StakeFactory } from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { InitializeEvent } from "../../../typechain/contracts/tier/CombineTier";
import {
  basicDeploy,
  compareStructs,
  getEventArgs,
  max_uint256,
  stakeDeploy,
} from "../../../utils";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { stakeFactoryDeploy } from "../../../utils/deploy/stake/stakeFactory/deploy";
import { combineTierDeploy } from "../../../utils/deploy/tier/combineTier/deploy";
import {
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { ALWAYS } from "../../../utils/tier";

const Opcode = AllStandardOps;

describe("CombineTier ERC165 tests", async function () {
  let stakeFactory: StakeFactory; 
  
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0])
   }) 

  before(async () => {
    stakeFactory = await stakeFactoryDeploy();
  });

  // report time for tier context
  const ctxAccount = op(Opcode.context, 0x0000);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.context, 0x0001),
      ctxAccount,
    op(Opcode.itierV2Report),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const evaluableConfig0 = await generateEvaluableConfig(
       [
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        sourceReportTimeForTierDefault,
      ],
       [ALWAYS],
    );
    const combineTierContract = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      evaluableConfig: evaluableConfig0,
    })) as CombineTier;

    const constants = [ethers.BigNumber.from(combineTierContract.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.context, 0x0000),
      op(Opcode.itierV2Report, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };
    const evaluableConfig1 = await generateEvaluableConfig(
      combineTierSourceConfig.sources ,
      combineTierSourceConfig.constants
    );
    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      evaluableConfig: evaluableConfig1,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });

  it("should pass ERC165 check by passing a Stake contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    const evaluableConfig0 = await generateEvaluableConfig(
      
         [
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0)),
        ],
         [max_uint256],

      
    );

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
      evaluableConfig: evaluableConfig0,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const constants = [ethers.BigNumber.from(stake.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.readMemory, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.context, 0x0000),
      op(Opcode.itierV2Report, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const evaluableConfig1 = await generateEvaluableConfig(
      combineTierSourceConfig.sources,
      combineTierSourceConfig.constants
    );
    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      evaluableConfig: evaluableConfig1,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });
});
