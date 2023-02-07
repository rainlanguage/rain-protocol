
import { assert } from "console";

import { Rainterpreter, Extrospection, RainterpreterExtern, RainterpreterExpressionDeployer, RainterpreterStore } from "../../typechain";
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


  before(async () => {
    rainInterpreter = await rainterpreterDeploy();
    extrospection = (await basicDeploy("Extrospection", {})) as Extrospection; 
    rainInterpreterExtern = await rainterpreterExtern(); 
    rainterpreterStore = await rainterpreterStoreDeploy() 
    expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      rainInterpreter
    );

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

    const interfaceId = "0x01ffc9a7" // interface ID

    const interpreterTx = await extrospection.emitSupportsInterface(rainInterpreter.address,interfaceId)  
    const storeTx = await extrospection.emitSupportsInterface(rainterpreterStore.address,interfaceId)  
    const externTx = await extrospection.emitSupportsInterface(rainInterpreterExtern.address,interfaceId)  
    const deployerTx = await extrospection.emitSupportsInterface(expressionDeployer.address,interfaceId)  

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

    assert(interpreterEvent.supportsInterface , "Interpreter does support Interface");
    assert(storeEvent.supportsInterface , "Interpreter does support Interface");
    assert(externEvent.supportsInterface , "Interpreter does support Interface");
    assert(deployerEvent.supportsInterface , "Interpreter does support Interface");


  }); 


});



