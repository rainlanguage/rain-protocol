import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { getOpcodesForHF } from "@ethereumjs/evm/dist/opcodes";
import { assert } from "console";

import { Rainterpreter, Extrospection } from "../../typechain";
import { BytecodeHashEvent } from "../../typechain/contracts/extrospection/Extrospection";
import { basicDeploy, getEventArgs } from "../../utils";
import { rainterpreterDeploy } from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";

const common = new Common({
  chain: Chain.Mainnet,
  hardfork: Hardfork.Istanbul,
});
const opcodes = getOpcodesForHF(common).opcodes;

describe("Extrospection tests", async function () {
  let rainInterpreter: Rainterpreter;
  let extrospection: Extrospection;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();
    extrospection = (await basicDeploy("Extrospection", {})) as Extrospection;
  });

  it("test", async () => {
    const tx = await extrospection.emitBytecodeHash(rainInterpreter.address);

    const event = (await getEventArgs(
      tx,
      "BytecodeHash",
      extrospection
    )) as BytecodeHashEvent["args"];

    console.log("event.bytecodeHash : ", event.bytecodeHash);
    const result = checkIfIncludesOps(event.bytecodeHash);
    console.log("result : ", result);
    assert(result);
  });
});

function nameOpCodes(raw) {
  let pushData;
  const opArray = [];

  for (let i = 0; i < raw.length; i++) {
    const pc = i;
    const curOpCode = opcodes.get(raw[pc])?.name;

    // no destinations into the middle of PUSH
    if (curOpCode?.slice(0, 4) === "PUSH") {
      const jumpNum = raw[pc] - 0x5f;
      pushData = raw.slice(pc + 1, pc + jumpNum + 1);
      i += jumpNum;
    }

    // console.log(
    //     pad(pc, roundLog(raw.length, 10)) + '  ' + curOpCode + ' ' + pushData?.toString('hex')
    // )
    // console.log(
    //   curOpCode
    // )
    const opObj = {
      index: pad(pc, roundLog(raw.length, 10)),
      opcode: curOpCode ? curOpCode : "",
      operand: pushData?.toString("hex"),
    };

    opArray.push(opObj);

    pushData = "";
  }
  return opArray;
}

function pad(num, size) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

function log(num, base) {
  return Math.log(num) / Math.log(base);
}

function roundLog(num, base) {
  return Math.ceil(log(num, base));
}

function checkIfIncludesOps(bytecode) {
  const data = bytecode.split("x")[1];
  const ops = nameOpCodes(Buffer.from(data, "hex"));
  const opArray = ["CREATE", "CREATE2", "SSTORE", "SELFDESTRUCT", "CALL"];

  for (let i = 0; i < ops.length; i++) {
    if (opArray.includes(ops[i].opcode)) {
      return false;
    }
  }
  return true;
}

// async function test() {
//     let res = checkIfIncludesOps()
//     console.log(res)
// }
// test()
