import { assert } from "chai";
import { ethers } from "hardhat";

import {
  Rainterpreter,
  Extrospection,
  RainterpreterExtern,
  RainterpreterExpressionDeployer,
  RainterpreterStore,
  EIP165InterfaceIds,
} from "../../typechain";
import {
  BytecodeHashEvent,
  SupportsInterfaceEvent,
} from "../../typechain/contracts/extrospection/Extrospection";
import { basicDeploy, getEventArgs } from "../../utils";
import {
  rainterpreterDeploy,
  rainterpreterExtern,
  rainterpreterStoreDeploy,
} from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { checkIfIncludesOps } from "../../utils/exstrospection";

describe("Extrospection tests", async function () {
  let rainInterpreter: Rainterpreter;
  let extrospection: Extrospection;
  let rainInterpreterExtern: RainterpreterExtern;
  let expressionDeployer: RainterpreterExpressionDeployer;
  let rainterpreterStore: RainterpreterStore;
  let EIP165InterfaceIDs: EIP165InterfaceIds;

  before(async () => {  
    // Deploy ERC1820Registry 
    const signers = await ethers.getSigners(); 
    await deploy1820(signers[0])

    // Deploy Extrospection
    extrospection = (await basicDeploy("Extrospection", {})) as Extrospection;
    // Deploy Interpreter
    rainInterpreter = await rainterpreterDeploy();
    // Deploy Extern
    rainInterpreterExtern = await rainterpreterExtern();
    // Deploy Store
    rainterpreterStore = await rainterpreterStoreDeploy();

    //Deploy Expression Deployer
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      rainInterpreter,
      rainterpreterStore
    );

    EIP165InterfaceIDs = (await basicDeploy(
      "EIP165InterfaceIds",
      {}
    )) as EIP165InterfaceIds;
  });

  it("should check if bytecode has any opcode that change memory(stateless interpreter)", async () => {
    const bytecode_ = await extrospection.bytecode(rainInterpreter.address);    
    const result = checkIfIncludesOps(bytecode_);
    assert(result);
  });

  it("should check if contract supports interface", async () => {
    const IExpressionDeployerV1InterfaceId =
      await EIP165InterfaceIDs.IExpressionDeployerV1InterfaceId();
    const IInterpreterExternV1InterfaceId =
      await EIP165InterfaceIDs.IInterpreterExternV1InterfaceId();
    const IInterpreterV1InterfaceId =
      await EIP165InterfaceIDs.IInterpreterV1InterfaceId();
    const IInterpreterStoreV1InterfaceId =
      await EIP165InterfaceIDs.IInterpreterStoreV1InterfaceId();

    const interfaceIds = [
      IExpressionDeployerV1InterfaceId,
      IInterpreterExternV1InterfaceId,
      IInterpreterV1InterfaceId,
      IInterpreterStoreV1InterfaceId,
    ];

    // Expression Deployer
    for (const interfaceId of interfaceIds) {
      const deployerTx = await extrospection.emitSupportsInterface(
        expressionDeployer.address,
        interfaceId
      );

      const deployerEvent = (await getEventArgs(
        deployerTx,
        "SupportsInterface",
        extrospection
      )) as SupportsInterfaceEvent["args"];

      if (interfaceId == IExpressionDeployerV1InterfaceId) {
        assert(
          deployerEvent.supportsInterface,
          `Deployer does not support interface: ${interfaceId}`
        );
      } else {
        assert(
          !deployerEvent.supportsInterface,
          `Deployer supports interface: ${interfaceId}`
        );
      }
    }

    // Extern
    for (const interfaceId of interfaceIds) {
      const externTx = await extrospection.emitSupportsInterface(
        rainInterpreterExtern.address,
        interfaceId
      );

      const externEvent = (await getEventArgs(
        externTx,
        "SupportsInterface",
        extrospection
      )) as SupportsInterfaceEvent["args"];

      if (interfaceId == IInterpreterExternV1InterfaceId) {
        assert(
          externEvent.supportsInterface,
          `Extern does not support interface: ${interfaceId}`
        );
      } else {
        assert(
          !externEvent.supportsInterface,
          `Extern supports interface: ${interfaceId}`
        );
      }
    }

    // Interpreter
    for (const interfaceId of interfaceIds) {
      const interpreterTx = await extrospection.emitSupportsInterface(
        rainInterpreter.address,
        interfaceId
      );

      const interpreterEvent = (await getEventArgs(
        interpreterTx,
        "SupportsInterface",
        extrospection
      )) as SupportsInterfaceEvent["args"];

      if (interfaceId == IInterpreterV1InterfaceId) {
        assert(
          interpreterEvent.supportsInterface,
          `Interpreter does not support interface: ${interfaceId}`
        );
      } else {
        assert(
          !interpreterEvent.supportsInterface,
          `Interpreter supports interface: ${interfaceId}`
        );
      }
    }

    // Store
    for (const interfaceId of interfaceIds) {
      const storeTx = await extrospection.emitSupportsInterface(
        rainterpreterStore.address,
        interfaceId
      );

      const storeEvent = (await getEventArgs(
        storeTx,
        "SupportsInterface",
        extrospection
      )) as SupportsInterfaceEvent["args"];

      if (interfaceId == IInterpreterStoreV1InterfaceId) {
        assert(
          storeEvent.supportsInterface,
          `Store does not support interface: ${interfaceId}`
        );
      } else {
        assert(
          !storeEvent.supportsInterface,
          `Store supports interface: ${interfaceId}`
        );
      }
    }
  });
});
