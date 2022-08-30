import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { CombineTier } from "../../../typechain";
import {
  AllStandardOpsTest,
  ReserveToken,
  StakeFactory,
  StandardIntegrity,
} from "../../../typechain";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { InitializeEvent } from "../../../typechain/contracts/tier/CombineTier";
import {
  basicDeploy,
  claimFactoriesDeploy,
  compareStructs,
  emissionsDeploy,
  getEventArgs,
  stakeDeploy,
} from "../../../utils";
import { combineTierDeploy } from "../../../utils/deploy/combineTier";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
  selectLte,
  selectLteLogic,
  selectLteMode,
} from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test";
import { ALWAYS } from "../../../utils/tier";

const Opcode = AllStandardOps;

describe("CombineTier ERC165 Test", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;
  let stakeFactory: StakeFactory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    // LogicFactory
    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;

    // StakeFactory
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();
  });

  // report time for tier context
  const ctxAccount = op(Opcode.CONTEXT, 0);

  // prettier-ignore
  // return default report
  const sourceReportTimeForTierDefault = concat([
      op(Opcode.THIS_ADDRESS),
      ctxAccount,
    op(Opcode.ITIERV2_REPORT),
  ]);

  it("should pass ERC165 check by passing a CombineTier contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();

    const combineTierContract = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
    })) as CombineTier;

    const constants = [ethers.BigNumber.from(combineTierContract.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: combineTierSourceConfig,
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

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    const constants = [ethers.BigNumber.from(stake.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: combineTierSourceConfig,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });

  it("should pass ERC165 check by passing an EmissionsERC20 contract inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];

    // Deploying EmissionsERC20 contract
    const { emissionsERC20Factory } = await claimFactoriesDeploy();

    const emissionsERC20Config = {
      allowDelegatedClaims: true,
      erc20Config: {
        name: "Emissions",
        symbol: "EMS",
        distributor: signers[0].address,
        initialSupply: 0,
      },
      vmStateConfig: {
        sources: [
          concat([op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))]),
        ],
        constants: [0],
      },
    };

    const emissionsERC20 = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      emissionsERC20Config
    );

    const constants = [ethers.BigNumber.from(emissionsERC20.address)];

    // prettier-ignore
    const sourceReport = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 1,
      sourceConfig: combineTierSourceConfig,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });

  it("should pass ERC165 check by passing multiple contracts inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];

    // EmissionsERC20
    const { emissionsERC20Factory } = await claimFactoriesDeploy();
    const emissionsERC20Config = {
      allowDelegatedClaims: true,
      erc20Config: {
        name: "Emissions",
        symbol: "EMS",
        distributor: signers[0].address,
        initialSupply: 0,
      },
      vmStateConfig: {
        sources: [
          concat([op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))]),
        ],
        constants: [0],
      },
    };
    const emissionsERC20Contract = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      emissionsERC20Config
    );

    // CombineTier
    const combineTierContract = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
    })) as CombineTier;

    // Stake
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };
    const stakeContract = await stakeDeploy(
      creator,
      stakeFactory,
      stakeConfigStruct
    );

    const constants = [
      ethers.BigNumber.from(emissionsERC20Contract.address),
      ethers.BigNumber.from(combineTierContract.address),
      ethers.BigNumber.from(stakeContract.address),
    ];

    // prettier-ignore
    const sourceReportEmissions = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReportCombineTier = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReportStake = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReport = concat([
          sourceReportEmissions,
          sourceReportCombineTier,
          sourceReportStake,
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.any, selectLteMode.first, 3)
      ),
    ]);

    // Deploying CombineTier Contract
    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    const combineTier = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 3,
      sourceConfig: combineTierSourceConfig,
    })) as CombineTier;

    const { config } = (await getEventArgs(
      combineTier.deployTransaction,
      "Initialize",
      combineTier
    )) as InitializeEvent["args"];

    assert(combineTier.signer == signers[0], "wrong signer");
    compareStructs(config, combineTierSourceConfig);
  });

  it("should fail ERC165 check by passing invalid contracts not inheriting TierV2", async () => {
    const signers = await ethers.getSigners();
    const creator = signers[0];
    // Passing AllStandardOpsTest contract address in constant.
    // This contract does not implement ITierV2
    let constants = [ethers.BigNumber.from(logic.address)];

    // prettier-ignore
    const dummyReportSource = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    await assertError(
      async () =>
        await combineTierDeploy(signers[0], {
          combinedTiersLength: 1,
          sourceConfig: {
            sources: [dummyReportSource, sourceReportTimeForTierDefault],
            constants,
          },
        }),
      "ERC165_TIERV2",
      "ERC165_TIERV2 check failed"
    );

    // Sending multiple contracts to CombineTier
    // EmissionsERC20
    const { emissionsERC20Factory } = await claimFactoriesDeploy();
    const emissionsERC20Config = {
      allowDelegatedClaims: true,
      erc20Config: {
        name: "Emissions",
        symbol: "EMS",
        distributor: signers[0].address,
        initialSupply: 0,
      },
      vmStateConfig: {
        sources: [
          concat([op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))]),
        ],
        constants: [0],
      },
    };
    const emissionsERC20Contract = await emissionsDeploy(
      creator,
      emissionsERC20Factory,
      emissionsERC20Config
    );

    // CombineTier
    const combineTierContract = (await combineTierDeploy(signers[0], {
      combinedTiersLength: 0,
      sourceConfig: {
        sources: [
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          sourceReportTimeForTierDefault,
        ],
        constants: [ALWAYS],
      },
    })) as CombineTier;

    // Stake
    const token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: token.address,
    };
    const stakeContract = await stakeDeploy(
      creator,
      stakeFactory,
      stakeConfigStruct
    );

    // prettier-ignore
    const sourceReportEmissions = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant,0)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReportCombineTier = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceReportStake = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    // prettier-ignore
    const sourceLogic = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.CONTEXT, 0),
      op(Opcode.ITIERV2_REPORT, 0),
    ]);

    constants = [
      ethers.BigNumber.from(emissionsERC20Contract.address),
      ethers.BigNumber.from(combineTierContract.address),
      ethers.BigNumber.from(stakeContract.address),
      ethers.BigNumber.from(logic.address), // Contract not inheriting TierV2
    ];

    // prettier-ignore
    const sourceReport = concat([
          sourceReportEmissions,
          sourceReportCombineTier,
          sourceReportStake,
          sourceLogic,
        op(Opcode.BLOCK_TIMESTAMP),
      op(
        Opcode.SELECT_LTE,
        selectLte(selectLteLogic.any, selectLteMode.first, 4)
      ),
    ]);

    // Deploying CombineTier Contract
    const combineTierSourceConfig = {
      sources: [sourceReport, sourceReportTimeForTierDefault],
      constants,
    };

    await assertError(
      async () =>
        await combineTierDeploy(signers[0], {
          combinedTiersLength: 4,
          sourceConfig: combineTierSourceConfig,
        }),
      "ERC165_TIERV2",
      "ERC165_TIERV2 check failed"
    );
  });
});
