/// Pure helper functions with no dependencies

/**
 * Utility function that transforms a hexadecimal number from the output of the ITier contract report
 * @param report String with Hexadecimal containing the array data
 * @returns number[] Block array of the reports
 */
export function tierReport(report: string): number[] {
  const parsedReport: number[] = [];
  const arrStatus = [0, 1, 2, 3, 4, 5, 6, 7]
    .map((i) =>
      BigInt(report)
        .toString(16)
        .padStart(64, "0")
        .slice(i * 8, i * 8 + 8)
    )
    .reverse();
  //arrStatus = arrStatus.reverse();

  for (const i in arrStatus) {
    parsedReport.push(parseInt("0x" + arrStatus[i]));
  }

  return parsedReport;
}

/**
 * Constructs the operand for RainVM's `call` opcode by packing 3 numbers into a single byte. All parameters use zero-based counting i.e. an `fnSize` of 0 means to allocate one element (32 bytes) on the stack to define your functions, while an `fnSize` of 3 means to allocate all four elements (4 * 32 bytes) on the stack.
 *
 * @param sourceIndex - index of function source in `immutableSourceConfig.sources`
 * @param loopSize - number of times to subdivide vals, reduces uint size but allows for more vals (range 0-7)
 * @param valSize - number of vals in outer stack (range 0-7)
 */
export function callSize(
  sourceIndex: number,
  loopSize: number,
  valSize: number
): number {
  // CallSize(
  //   op_.val & 0x07,      // 00000111
  //   op_.val >> 3 & 0x03, // 00011000
  //   op_.val >> 5 & 0x07  // 11100000
  // )

  if (sourceIndex < 0 || sourceIndex > 7) {
    throw new Error("Invalid fnSize");
  } else if (loopSize < 0 || loopSize > 3) {
    throw new Error("Invalid loopSize");
  } else if (valSize < 0 || valSize > 7) {
    throw new Error("Invalid valSize");
  }
  let callSize = valSize;
  callSize <<= 2;
  callSize += loopSize;
  callSize <<= 3;
  callSize += sourceIndex;
  return callSize;
}

export function skip(places: number, conditional = false): number {
  let skip = conditional ? 1 : 0;
  skip <<= 7;
  // JS ints are already signed.
  skip |= places & 0x7f;
  return skip;
}

export const wrap2BitUInt = (integer: number) => {
  while (integer > 3) {
    integer -= 4;
  }
  return integer;
};

export const wrap4BitUInt = (integer: number) => {
  while (integer > 15) {
    integer -= 16;
  }
  return integer;
};

export const wrap8BitUInt = (integer: number) => {
  while (integer > 255) {
    integer -= 256;
  }
  return integer;
};

export const array2BitUInts = (length) =>
  Array(length)
    .fill(0)
    // .map((_, i) => 3);
    .map((_, i) => wrap2BitUInt(i));

export const array4BitUInts = (length) =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap4BitUInt(i));

export const array8BitUInts = (length) =>
  Array(length)
    .fill(0)
    .map((_, i) => wrap8BitUInt(i));

export const pack32UIntsIntoByte = (numArray: number[]): number[] => {
  const val: number[] = [];
  let valIndex = 0;

  for (let i = 0; i < numArray.length; i += 4) {
    const byte =
      (numArray[i] << 6) +
      (numArray[i + 1] << 4) +
      (numArray[i + 2] << 2) +
      numArray[i + 3];

    val[valIndex] = byte;
    valIndex++;
  }

  return val;
};

export function selectLte(logic: number, mode: number, length: number): number {
  let lte = logic;
  lte <<= 2;
  lte += mode;
  lte <<= 5;
  lte += length;
  return lte;
}
