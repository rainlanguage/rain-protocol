/* Transforms BigNumber to a data array returned by the contract */
import chai from 'chai'
const { assert } = chai

/**
 * Utility function that transforms a hexadecimal number from the output of the TVKPrestige contract report
 * @param report String with Hexadecimal containing the array data
 * @returns number[] Block array of the reports
 */
export function tvkStatusReport (report: string): number[] {
    let statusReport : number[] = [];
    let arrStatus = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => BigInt(report).toString(16).padStart(64, '0').slice(i*8, i*8+8)).reverse();
    //arrStatus = arrStatus.reverse();

    for (let i in arrStatus) {
        statusReport.push(parseInt('0x' + arrStatus[i]));
    }

    return statusReport;
}

export function blockNumbersToReport (blockNos: number[]): string {
    assert(blockNos.length === 8)

    return [...blockNos].reverse().map((i) => BigInt(i).toString(16).padStart(8, '0')).join('')
}

export const assertError = async (f:Function, s:string, e:string) => {
    let didError = false
    try {
        await f()
    } catch (e) {
        assert(e.toString().includes(s))
        didError = true
    }
    assert(didError, e)
}