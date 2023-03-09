import { assert } from "chai";

import { artifacts , ethers } from "hardhat";

import { OrderBook } from "../../typechain/contracts/orderbook/OrderBook";

import deploy1820 from "../../utils/deploy/registry1820/deploy";
import { getTouchDeployer } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../typechain/contracts/flow/FlowCommon";
import {
  assertError,
  getRainMetaDocumentFromContract,
  zeroAddress,
} from "../../utils"; 
import OrderBookMeta from "../../contracts/orderbook/OrderBook.meta.json" 
import _ from 'lodash';

describe("OrderBook Constructor", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should fail if deploy is initiated with bad callerMeta", async function () {
    const orderBookFactory = await ethers.getContractFactory("OrderBook", {});
    const touchDeployer = await getTouchDeployer();

    const config0: InterpreterCallerV1ConstructionConfigStruct = {
      meta: getRainMetaDocumentFromContract("orderbook"),
      deployer: touchDeployer.address,
    };
    const orderBook = (await orderBookFactory.deploy(config0)) as OrderBook;

    assert(!(orderBook.address === zeroAddress), "OrderBook did not deploy");

    const config1: InterpreterCallerV1ConstructionConfigStruct = {
      meta: getRainMetaDocumentFromContract("lobby"),
      deployer: touchDeployer.address,
    };

    await assertError(
      async () => await orderBookFactory.deploy(config1),
      "UnexpectedMetaHash",
      "Stake Deployed for bad hash"
    );
  });  

  it("should validate contract meta with abi ", async function () { 

    // Get contract ABI
    const orderBookAbi = (await artifacts.readArtifact("OrderBook")).abi    

    // Get methods from meta
    const methods = OrderBookMeta.methods

    for (let i = 0 ; i < methods.length ; i++){ 

      // Eval consistenct for meta and abi 
      let method = methods[i]  
      let inputs = method.inputs
      let expressions = method.expressions

      // Check for inputs
      for(let j = 0 ; j < inputs.length ; j++){
        if(
          inputs[j].name != _.get(orderBookAbi, inputs[j].path).name 
        ){
          assert.fail(`mismatch input name for method ${method.name},
                         expected  ${_.get(orderBookAbi, inputs[j].path).name}
                         got       ${inputs[j].name}`);
        }
      }
      
      //Check for expressions
      for(let k = 0 ; k < expressions.length ; k++){
        if(
          expressions[k].name != _.get(orderBookAbi, expressions[k].path).name 
        ){
          assert.fail(`mismatch expression name for method ${method.name},
                         expected  ${_.get(orderBookAbi, expressions[k].path).name}
                         got       ${expressions[k].name}`);
        }
      }

    }
  }); 


});
