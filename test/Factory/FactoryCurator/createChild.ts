import { assert } from "chai";
import { concat, defaultAbiCoder } from "ethers/lib/utils";
import { artifacts, ethers } from "hardhat";
import type {
  CloneFactory,
  CombineTier,
  FactoryChildTest,
  FactoryCurator,
  FactoryTest,
  ReadWriteTier,
  ReserveToken,
  ReserveToken18,
} from "../../../typechain";
import {
  CurationConfigStruct,
  RegisterCurationEvent,
} from "../../../typechain/contracts/factory/FactoryCurator";
import {
  EvaluableConfigStruct,
  Stake,
  StakeConfigStruct,
} from "../../../typechain/contracts/stake/Stake";
import { InitializeEvent } from "../../../typechain/contracts/test/factory/Factory/FactoryChildTest";
import {
  combineTierCloneDeploy,
  combineTierImplementation,
  generateEvaluableConfig,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  stakeCloneDeploy,
  stakeImplementation,
  THRESHOLDS,
  THRESHOLDS_18,
  timewarp,
} from "../../../utils";
import {
  max_uint256,
  max_uint32,
  sixZeros,
} from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../../utils/events";
import { assertError } from "../../../utils/test/assertError";
import { Tier } from "../../../utils/types/tier";

describe("FactoryCurator createChild", async function () {
  let reserve: ReserveToken;
  let implementationStake: Stake;
  let cloneFactory: CloneFactory;
  let implementationCombineTier: CombineTier;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementationStake = await stakeImplementation();
    implementationCombineTier = await combineTierImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  beforeEach(async () => {
    reserve = await reserveDeploy();
  });

  it("should revert if user does not meet tier requirement", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    // await readWriteTier.setTier(signer1.address, Tier.FOUR);

    await assertError(
      async () =>
        await factoryCurator
          .connect(signer1)
          .createChild(
            id_,
            config_,
            defaultAbiCoder.encode(["uint256"], [childValue])
          ),
      "MINIMUM_TIER",
      "did not revert when user failed to meet tier requirement"
    );
  });

  it("should revert if config has not been registered", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];
    const wrongCurator = signers[3];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    await readWriteTier.setTier(signer1.address, Tier.FOUR);

    await assertError(
      async () =>
        await factoryCurator.connect(signer1).createChild(
          id_.add(1), // id doesn't exist
          config_,
          defaultAbiCoder.encode(["uint256"], [childValue])
        ),
      "NOT_IN_REGISTRY",
      "did not revert when given bad id"
    );

    await assertError(
      async () =>
        await factoryCurator.connect(signer1).createChild(
          id_,
          { ...config_, curator: wrongCurator.address }, // unregistered config
          defaultAbiCoder.encode(["uint256"], [childValue])
        ),
      "NOT_IN_REGISTRY",
      "did not revert when given unregistered config"
    );
  });

  it("should create a child using a registered config", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    await readWriteTier.setTier(signer1.address, Tier.FOUR);

    const txCreateChild = await factoryCurator
      .connect(signer1)
      .createChild(
        id_,
        config_,
        defaultAbiCoder.encode(["uint256"], [childValue])
      );

    const factoryChildTest = new ethers.Contract(
      ethers.utils.hexZeroPad(
        ethers.utils.hexStripZeros(
          (await getEventArgs(txCreateChild, "NewChild", factoryTest)).child
        ),
        20
      ),
      (await artifacts.readArtifact("FactoryChildTest")).abi
    ) as FactoryChildTest;

    const { sender: sender_, value: value_ } = (await getEventArgs(
      txCreateChild,
      "Initialize",
      factoryChildTest
    )) as InitializeEvent["args"];

    assert(
      sender_ === factoryTest.address,
      "wrong sender in factory child test InitializeEvent"
    );
    assert(
      value_.eq(childValue),
      "wrong value in factory child test InitializeEvent"
    );
  });

  it("should test createChild by passing stake tier contract which utilizes context", async () => {
    const signers = await ethers.getSigners();
    const curator = signers[1];
    const alice = signers[2];
    const deployer = signers[3];

    // Stake expect 18 decimal asset
    const reserve18 = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await reserve18.initialize();

    const evaluableConfig: EvaluableConfigStruct =
      await generateEvaluableConfig(
        [
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        ],
        [max_uint256]
      );
    // Stake contract
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserve18.address,
      evaluableConfig: evaluableConfig,
    };
    const stake = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    // Give Alice reserve tokens and deposit them // Tier being set : 1
    const depositAmount0 = THRESHOLDS_18[1].add(1);
    await reserve18.transfer(alice.address, depositAmount0);
    await reserve18.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve18.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: stake.address,
        minimumTier: Tier.FOUR, // Setting minimum Tier to 4
        context: THRESHOLDS_18,
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve18.transfer(alice.address, FEE);
    await reserve18.connect(alice).approve(factoryCurator.address, FEE);

    await assertError(
      async () =>
        await factoryCurator
          .connect(alice)
          .createChild(
            id_,
            config_,
            defaultAbiCoder.encode(["uint256"], [childValue])
          ),
      "MINIMUM_TIER",
      "did not revert when user failed to meet tier requirement"
    );

    // Alice deposits more reserve tokens which lets her achieve Tier 4
    const depositAmount1 = THRESHOLDS_18[4].add(1); // exceeds all thresholds
    await reserve18.transfer(alice.address, depositAmount1);
    await reserve18.connect(alice).approve(stake.address, depositAmount1);
    await stake.connect(alice).deposit(depositAmount0, alice.address);

    // Transferring and Approving Fee
    await reserve18.transfer(alice.address, FEE);
    await reserve18.connect(alice).approve(factoryCurator.address, FEE);

    // Creating child
    const txCreateChild = await factoryCurator
      .connect(alice)
      .createChild(
        id_,
        config_,
        defaultAbiCoder.encode(["uint256"], [childValue])
      );

    const factoryChildTest = new ethers.Contract(
      ethers.utils.hexZeroPad(
        ethers.utils.hexStripZeros(
          (await getEventArgs(txCreateChild, "NewChild", factoryTest)).child
        ),
        20
      ),
      (await artifacts.readArtifact("FactoryChildTest")).abi
    ) as FactoryChildTest;

    const { sender: sender_, value: value_ } = (await getEventArgs(
      txCreateChild,
      "Initialize",
      factoryChildTest
    )) as InitializeEvent["args"];

    assert(
      sender_ === factoryTest.address,
      "wrong sender in factory child test InitializeEvent"
    );
    assert(
      value_.eq(childValue),
      "wrong value in factory child test InitializeEvent"
    );
  });

  it("should test createChild by passing CombineTier contract which utilizes context", async () => {
    const signers = await ethers.getSigners();
    const curator = signers[1];
    const alice = signers[2];
    const deployer = signers[3];

    const evaluableConfig: EvaluableConfigStruct =
      await generateEvaluableConfig(
        [
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
        ],
        [max_uint256]
      );

    // Stake contract
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserve.address,
      evaluableConfig: evaluableConfig,
    };

    const stake0 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );
    const stake1 = await stakeCloneDeploy(
      deployer,
      cloneFactory,
      implementationStake,
      stakeConfigStruct
    );

    // Give Alice reserve tokens and deposit them // Tier being set : 1
    const depositAmount0 = THRESHOLDS[4].add(1); // exceeds all thresholds
    await reserve.transfer(alice.address, depositAmount0);
    await reserve.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);

    // CombineTier
    // prettier-ignore
    const sourceReportStake0 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0101), // TIER
        op(Opcode.context, 0x0200), // THRESHOLD
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report_time_for_tier, THRESHOLDS.length)
    ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
        op(Opcode.context, 0x0100), // address
        op(Opcode.context, 0x0101), // TIER
        op(Opcode.context, 0x0200), // THRESHOLD
        op(Opcode.context, 0x0201),
        op(Opcode.context, 0x0202),
        op(Opcode.context, 0x0203),
        op(Opcode.context, 0x0204),
        op(Opcode.context, 0x0205),
        op(Opcode.context, 0x0206),
        op(Opcode.context, 0x0207),
      op(Opcode.itier_v2_report_time_for_tier, THRESHOLDS.length)
    ]);

    const sourceReportDefault = concat([
      op(Opcode.context, 0x0201),
      op(Opcode.context, 0x0200),
      op(Opcode.itier_v2_report),
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceMain = concat([
            sourceReportStake0, // stake0 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint32
          op(Opcode.less_than),
            sourceReportStake1, // stake1 report
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // max_uint32
          op(Opcode.less_than),
        op(Opcode.every, 2), // Condition
        sourceReportStake0, // TRUE
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // FALSE
      op(Opcode.eager_if)
    ]);

    const evaluableConfigCombineTier = await generateEvaluableConfig(
      [sourceReportDefault, sourceMain],
      [stake0.address, stake1.address, max_uint32]
    );

    const combineTierMain = await combineTierCloneDeploy(
      deployer,
      cloneFactory,
      implementationCombineTier,
      2,
      evaluableConfigCombineTier
    );

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: combineTierMain.address,
        minimumTier: Tier.FOUR, // Setting minimum Tier to 4
        context: THRESHOLDS,
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.transfer(alice.address, FEE);
    await reserve.connect(alice).approve(factoryCurator.address, FEE);

    await assertError(
      async () =>
        await factoryCurator
          .connect(alice)
          .createChild(
            id_,
            config_,
            defaultAbiCoder.encode(["uint256"], [childValue])
          ),
      "MINIMUM_TIER",
      "did not revert when user failed to meet tier requirement"
    );

    // Give Alice reserve tokens and deposit them to stake1
    // This will return a valid report for alice
    await timewarp(10000);
    const depositAmount1 = THRESHOLDS[4].add(1);
    await reserve.transfer(alice.address, depositAmount1);
    await reserve.connect(alice).approve(stake1.address, depositAmount1);
    await stake1.connect(alice).deposit(depositAmount1, alice.address);

    // Transferring and Approving Fee
    await reserve.transfer(alice.address, FEE);
    await reserve.connect(alice).approve(factoryCurator.address, FEE);

    // Creating child
    const txCreateChild = await factoryCurator
      .connect(alice)
      .createChild(
        id_,
        config_,
        defaultAbiCoder.encode(["uint256"], [childValue])
      );

    const factoryChildTest = new ethers.Contract(
      ethers.utils.hexZeroPad(
        ethers.utils.hexStripZeros(
          (await getEventArgs(txCreateChild, "NewChild", factoryTest)).child
        ),
        20
      ),
      (await artifacts.readArtifact("FactoryChildTest")).abi
    ) as FactoryChildTest;

    const { sender: sender_, value: value_ } = (await getEventArgs(
      txCreateChild,
      "Initialize",
      factoryChildTest
    )) as InitializeEvent["args"];

    assert(
      sender_ === factoryTest.address,
      "wrong sender in factory child test InitializeEvent"
    );
    assert(
      value_.eq(childValue),
      "wrong value in factory child test InitializeEvent"
    );
  });
});
