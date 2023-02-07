import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { getOpcodesForHF } from "@ethereumjs/evm/dist/opcodes"; 

const common = new Common({
    chain: Chain.Mainnet,
    hardfork: Hardfork.Istanbul,
  });
  const opcodes = getOpcodesForHF(common).opcodes; 


  export function nameOpCodes(raw: Buffer) {
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
  
  export function pad(num: number, size: number) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  }
  
  export function log(num: number, base: number) {
    return Math.log(num) / Math.log(base);
  }
  
  export function roundLog(num: number, base: number) {
    return Math.ceil(log(num, base));
  }
  
  export function checkIfIncludesOps(bytecode: string) {
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
  