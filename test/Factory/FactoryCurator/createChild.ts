import { assert } from "chai";
import { concat, defaultAbiCoder } from "ethers/lib/utils";
import { artifacts, ethers } from "hardhat";
import type {
  CombineTier,
  FactoryChildTest,
  FactoryCurator,
  FactoryTest,
  ReadWriteTier,
  ReserveToken18,
  StakeFactory,
} from "../../../typechain";
import {
  CurationConfigStruct,
  RegisterCurationEvent,
} from "../../../typechain/contracts/factory/FactoryCurator";
import { StakeConfigStruct } from "../../../typechain/contracts/stake/Stake";
import { InitializeEvent } from "../../../typechain/contracts/test/factory/Factory/FactoryChildTest";
import {
  combineTierDeploy,
  memoryOperand,
  MemoryType,
  op,
  Opcode,
  stakeDeploy,
  THRESHOLDS,
  THRESHOLDS_18,
  timewarp,
} from "../../../utils";
import { max_uint32, sixZeros } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../../utils/events";
import { assertError } from "../../../utils/test/assertError";
import { Tier } from "../../../utils/types/tier";

describe("FactoryCurator createChild", async function () {
  it("should revert if user does not meet tier requirement", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = await reserveDeploy();

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

    const reserve = await reserveDeploy();

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

    const reserve = await reserveDeploy();

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

    // Stake contract
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    const stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserve18.address,
    };
    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

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

    // Reserve token
    const reserve = await reserveDeploy();

    // Stake contract
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    const stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();
    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      asset: reserve.address,
    };

    const stake0 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);
    const stake1 = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and deposit them // Tier being set : 1
    const depositAmount0 = THRESHOLDS[4].add(1); // exceeds all thresholds
    await reserve.transfer(alice.address, depositAmount0);
    await reserve.connect(alice).approve(stake0.address, depositAmount0);
    await stake0.connect(alice).deposit(depositAmount0, alice.address);

    // CombineTier
    // prettier-ignore
    const sourceReportStake0 = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)), // ITierV2 contract stake0
      op(Opcode.CONTEXT, 0x0000), // address
      op(Opcode.CONTEXT, 0x0001), // TIER
      op(Opcode.CONTEXT, 0x0100), // THRESHOLD
      op(Opcode.CONTEXT, 0x0101),
      op(Opcode.CONTEXT, 0x0102),
      op(Opcode.CONTEXT, 0x0103),
      op(Opcode.CONTEXT, 0x0104),
      op(Opcode.CONTEXT, 0x0105),
      op(Opcode.CONTEXT, 0x0106),
      op(Opcode.CONTEXT, 0x0107),
    op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
  ]);

    // prettier-ignore
    const sourceReportStake1 = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // ITierV2 contract stake1
      op(Opcode.CONTEXT, 0x0000), // address
      op(Opcode.CONTEXT, 0x0001), // TIER
      op(Opcode.CONTEXT, 0x0100), // THRESHOLD
      op(Opcode.CONTEXT, 0x0101),
      op(Opcode.CONTEXT, 0x0102),
      op(Opcode.CONTEXT, 0x0103),
      op(Opcode.CONTEXT, 0x0104),
      op(Opcode.CONTEXT, 0x0105),
      op(Opcode.CONTEXT, 0x0106),
      op(Opcode.CONTEXT, 0x0107),
    op(Opcode.ITIERV2_REPORT_TIME_FOR_TIER, THRESHOLDS.length)
  ]);

    const sourceReportDefault = concat([
      op(Opcode.THIS_ADDRESS),
      op(Opcode.CONTEXT, 0x0000),
      op(Opcode.ITIERV2_REPORT),
    ]);

    // MAIN
    // The source will check Alice's report of a TIER for stake0 and stake1 contract. If valid, return stake0 report else max_uint32
    // prettier-ignore
    const sourceMain = concat([
          sourceReportStake0, // stake0 report
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // max_uint32
        op(Opcode.LESS_THAN),
          sourceReportStake1, // stake1 report
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // max_uint32
        op(Opcode.LESS_THAN),
      op(Opcode.EVERY, 2), // Condition
      sourceReportStake0, // TRUE
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)), // FALSE
    op(Opcode.EAGER_IF)
  ]);

    const combineTierMain = (await combineTierDeploy(deployer, {
      combinedTiersLength: 2,
      sourceConfig: {
        sources: [sourceReportDefault, sourceMain],
        constants: [stake0.address, stake1.address, max_uint32],
      },
    })) as CombineTier;

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
