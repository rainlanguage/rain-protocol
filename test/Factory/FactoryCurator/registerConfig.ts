import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  FactoryCurator,
  FactoryTest,
  ReadWriteTier,
} from "../../../typechain";
import {
  CurationConfigStruct,
  RegisterCurationEvent,
} from "../../../typechain/contracts/factory/FactoryCurator";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { reserveDeploy } from "../../../utils/deploy/test/reserve/deploy";
import { getEventArgs } from "../../../utils/events";
import { compareStructs } from "../../../utils/test/compareStructs";
import { Tier } from "../../../utils/types/tier";

describe("FactoryCurator registerConfig", async function () {
  it("should emit event when config is registered", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = await reserveDeploy();

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

    const {
      sender: sender_,
      id: id_,
      config: config_,
    } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    assert(
      sender_ === signers[0].address,
      "wrong sender in RegisterCurationEvent"
    );
    assert(id_.eq(1), "wrong highwater id in RegisterCurationEvent");
    compareStructs(config_, config);
  });
});
