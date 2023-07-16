import { strict as assert } from "assert";
import { ethers } from "hardhat";
import { Fallback, IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { getBlockTimestamp } from "../../../../utils/hardhat";
import {
  opMetaHash,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";
import { rainlang } from "../../../../utils/extensions/rainlang";
import { basicDeploy, eighteenZeros } from "../../../../utils";

describe("RainInterpreter Interpreter constant ops", async () => {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should return block.timestamp", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
_: block-timestamp();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const timestamp = await getBlockTimestamp();
    const result = await logic.stackTop();

    assert(
      result.eq(timestamp),
      `expected timestamp ${timestamp} got ${result}`
    );
  });

  it("should return block.number", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
_: block-number();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block = await ethers.provider.getBlockNumber();
    const result = await logic.stackTop();
    assert(result.eq(block), `expected block ${block} got ${result}`);
  });

  it("should return block.chainid", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
_: chain-id();`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const id = (await ethers.provider.getNetwork()).chainId;
    const result = await logic.stackTop();
    assert(result.eq(id), `expected chain id ${id} got ${result}`);
  });

  it("should return account balance for accounts" , async () => {

    const signers = await ethers.getSigners();
    const [, alice, bob] = signers;

    const { sources : sources0, constants : constants0 } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
        _: balance(${alice.address}),
        _: balance(${bob.address}) ;`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
      rainInterpreter,
      2
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const expectedAliceBalance0 = await ethers.provider.getBalance(alice.address)
    const expectedBobBalance0 = await ethers.provider.getBalance(bob.address)

    const [aliceBalance0 , bobBalance0] = await logic.stack();

    assert(aliceBalance0.eq(expectedAliceBalance0), `expected balance ${expectedAliceBalance0.toString()} got ${aliceBalance0.toString()}`);
    assert(bobBalance0.eq(expectedBobBalance0), `expected balance ${expectedBobBalance0.toString()} got ${bobBalance0.toString()}`);

    const balanceDiff = ethers.BigNumber.from('100' + eighteenZeros)

    await alice.sendTransaction({
      to: bob.address,
      value : aliceBalance0.sub(balanceDiff)
    })

    const { sources : sources1, constants : constants1 } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
        _: balance(${alice.address}),
        _: balance(${bob.address}) ;`
    );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      2
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const expectedAliceBalance1 = await ethers.provider.getBalance(alice.address)
    const expectedBobBalance1 = await ethers.provider.getBalance(bob.address)

    const [aliceBalance1 , bobBalance1] = await logic.stack();

    assert(aliceBalance1.eq(expectedAliceBalance1), `expected balance ${expectedAliceBalance1.toString()} got ${aliceBalance1.toString()}`);
    assert(bobBalance1.eq(expectedBobBalance1), `expected balance ${expectedBobBalance1.toString()} got ${bobBalance1.toString()}`);

  })

  it("should return balance for contract account" , async () => {

    const signers = await ethers.getSigners();
    const [, ,alice] = signers;

    const fallbackContract = (await basicDeploy("Fallback", {})) as Fallback ;

    const { sources : sources0, constants : constants0 } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
        _: balance(${fallbackContract.address}) ;`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const expectedBalance0 = await ethers.provider.getBalance(fallbackContract.address)

    const [balance0] = await logic.stack();

    assert(balance0.eq(expectedBalance0), `expected balance ${expectedBalance0.toString()} got ${balance0.toString()}`);

    const balanceDiff = ethers.BigNumber.from('10' + eighteenZeros)

    await alice.sendTransaction({
      to: fallbackContract.address,
      value : balanceDiff
    })

    const { sources : sources1, constants : constants1 } = await standardEvaluableConfig(
      rainlang`
        @${opMetaHash}
        _: balance(${fallbackContract.address}) ;`
    );

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const expectedBalance1 = await ethers.provider.getBalance(fallbackContract.address)

    const [balance1] = await logic.stack();

    assert(balance1.eq(expectedBalance1), `expected balance ${expectedBalance1.toString()} got ${balance1.toString()}`);

  })


});
