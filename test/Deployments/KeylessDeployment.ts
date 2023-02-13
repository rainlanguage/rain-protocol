import { ethers } from "hardhat";
import {
  getEventArgsFromLogs,
  getRainContractMetaBytes,
  keylessDeploy,
} from "../../utils";
import { expect } from "chai";

import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { Cooldown, Extrospection, FlowFactory } from "../../typechain";
import { ImplementationEvent } from "../../typechain/contracts/factory/Factory";

describe("Keyless deployment method", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const [signer] = await ethers.getSigners();
    await deploy1820(signer);
  });

  it("should deploy correctly the contract with the correct bytecode", async function () {
    const [signer] = await ethers.getSigners();

    const extrospection = (await keylessDeploy(
      "Extrospection",
      signer
    )) as Extrospection;

    const cooldown = (await keylessDeploy("Cooldown", signer)) as Cooldown;

    const codeFromExtrospection = await extrospection.bytecode(
      cooldown.address
    );

    const codeFromChain = await signer.provider.getCode(cooldown.address);

    expect(codeFromExtrospection).to.be.equal(
      codeFromChain,
      "The extrospection call failed"
    );
  });

  it("should deploy contracts with arguments correctly", async function () {
    const [signer] = await ethers.getSigners();
    const flowMeta = getRainContractMetaBytes("flow");

    const flowFactory = (await keylessDeploy(
      "FlowFactory",
      signer,
      flowMeta
    )) as FlowFactory;

    const { sender, implementation } = (await getEventArgsFromLogs(
      flowFactory.deployTransaction,
      "Implementation",
      flowFactory
    )) as ImplementationEvent["args"];

    expect(sender).to.be.equal(flowFactory.deployTransaction.from);

    expect(implementation).to.be.equal(await flowFactory.implementation());
  });
});
