
import { assert } from "chai";


import { Rainterpreter, Extrospection, RainterpreterExtern, RainterpreterExpressionDeployer, RainterpreterStore, EIP165InterfaceIds } from "../../typechain";
import { BytecodeHashEvent, SupportsInterfaceEvent } from "../../typechain/contracts/extrospection/Extrospection";
import { basicDeploy, getEventArgs } from "../../utils";
import { rainterpreterDeploy, rainterpreterExtern, rainterpreterStoreDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { checkIfIncludesOps } from "../../utils/exstrospection";



describe("Extrospection tests", async function () { 

  let rainInterpreter: Rainterpreter;
  let extrospection: Extrospection;
  let rainInterpreterExtern: RainterpreterExtern;
  let expressionDeployer: RainterpreterExpressionDeployer
  let rainterpreterStore: RainterpreterStore 
  let EIP165InterfaceIDs: EIP165InterfaceIds



  before(async () => {  

  
    // Deploy Interpreter
    rainInterpreter = await rainterpreterDeploy();
    // Deploy Extrospection
    extrospection = (await basicDeploy("Extrospection", {})) as Extrospection;
    // Deploy Extern
    rainInterpreterExtern = await rainterpreterExtern();
    // Deploy Store
    rainterpreterStore = await rainterpreterStoreDeploy() 
    // Deploy Expression Deployer
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      rainInterpreter
    ); 

    EIP165InterfaceIDs = (await basicDeploy("EIP165InterfaceIds", {})) as EIP165InterfaceIds;

  });

  it("should check if bytecode has any opcode that change memory(stateless interpreter)", async () => {
    const tx = await extrospection.emitBytecodeHash(rainInterpreter.address);

    const event = (await getEventArgs(
      tx,
      "BytecodeHash",
      extrospection
    )) as BytecodeHashEvent["args"];


    const result = checkIfIncludesOps(event.bytecodeHash);
    assert(result);

  });

  it("should check if contract supports interface", async () => {  


    const IExpressionDeployerV1InterfaceId = await EIP165InterfaceIDs.IExpressionDeployerV1InterfaceId() 
    const IInterpreterExternV1InterfaceId = await EIP165InterfaceIDs.IInterpreterExternV1InterfaceId() 
    const IInterpreterV1InterfaceId = await EIP165InterfaceIDs.IInterpreterV1InterfaceId() 
    const IInterpreterStoreV1InterfaceId = await EIP165InterfaceIDs.IInterpreterStoreV1InterfaceId()   


    const interpreterTx = await extrospection.emitSupportsInterface(rainInterpreter.address,IInterpreterV1InterfaceId)
    const storeTx = await extrospection.emitSupportsInterface(rainterpreterStore.address,IInterpreterStoreV1InterfaceId)
    const externTx = await extrospection.emitSupportsInterface(rainInterpreterExtern.address,IInterpreterExternV1InterfaceId)
    const deployerTx = await extrospection.emitSupportsInterface(expressionDeployer.address,IExpressionDeployerV1InterfaceId)

    

    const interpreterEvent = (await getEventArgs(
      interpreterTx,
      "SupportsInterface",
      extrospection
    )) as SupportsInterfaceEvent["args"];

    const storeEvent = (await getEventArgs(
      storeTx,
      "SupportsInterface",
      extrospection
    )) as SupportsInterfaceEvent["args"];

    const externEvent = (await getEventArgs(
      externTx,
      "SupportsInterface",
      extrospection
    )) as SupportsInterfaceEvent["args"];

    const deployerEvent = (await getEventArgs(
      deployerTx,
      "SupportsInterface",
      extrospection
    )) as SupportsInterfaceEvent["args"]; 


    assert(interpreterEvent.supportsInterface  , "Interpreter does not support interface IInterpreterV1");
    assert(storeEvent.supportsInterface , "Store does not support interface IInterpreterStoreV1");
    assert(externEvent.supportsInterface , "Extern does not support IInterpreterExternV1");
    assert(deployerEvent.supportsInterface , "Deployer does not support IExpressionDeployerV1");


  });


});



