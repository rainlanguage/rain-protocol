import type {
  CurationConfigStruct,
  FactoryCurator,
  RegisterCurationEvent,
} from "../../../typechain/FactoryCurator";
import type { FactoryTest } from "../../../typechain/FactoryTest";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { ethers } from "hardhat";
import { ReserveToken } from "../../../typechain/ReserveToken";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { Tier } from "../../../utils/types/tier";

describe("FactoryCurator createChild", async function () {
  it("should create a child on the good path", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    await reserve.transfer(curator.address, await reserve.TOTAL_SUPPLY());

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
        amount: 100,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [10, 20, 30],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve
      .connect(curator)
      .approve(factoryCurator.address, await reserve.TOTAL_SUPPLY());

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const txCreateChild = await factoryCurator
      .connect(signer1)
      .createChild(id_, config_, [childValue]);
  });
});
