import chainlinkOraclePriceMeta from "../../../contracts/interpreter/ops/chainlink/ChainlinkOraclePrice.opmeta.json";
import callMeta from "../../../contracts/interpreter/ops/core/Call.opmeta.json";
import contextMeta from "../../../contracts/interpreter/ops/core/Context.opmeta.json";
import contextRowMeta from "../../../contracts/interpreter/ops/core/ContextRow.opmeta.json";
import debugMeta from "../../../contracts/interpreter/ops/core/Debug.opmeta.json";
import doWhileMeta from "../../../contracts/interpreter/ops/core/DoWhile.opmeta.json";
import foldContextMeta from "../../../contracts/interpreter/ops/core/FoldContext.opmeta.json";
import getMeta from "../../../contracts/interpreter/ops/core/Get.opmeta.json";
import loopNMeta from "../../../contracts/interpreter/ops/core/LoopN.opmeta.json";
import readMemoryMeta from "../../../contracts/interpreter/ops/core/ReadMemory.opmeta.json";
import setMeta from "../../../contracts/interpreter/ops/core/Set.opmeta.json";
import hashMeta from "../../../contracts/interpreter/ops/crypto/Hash.opmeta.json";
import erc1155BalanceOfMeta from "../../../contracts/interpreter/ops/erc1155/ERC1155BalanceOfBatch.opmeta.json";
import erc1155BalanceOfBatchMeta from "../../../contracts/interpreter/ops/erc1155/ERC1155BalanceOf.opmeta.json";
import erc20BalanceOfMeta from "../../../contracts/interpreter/ops/erc20/ERC20BalanceOf.opmeta.json";
import erc20TotalSupplyMeta from "../../../contracts/interpreter/ops/erc20/ERC20TotalSupply.opmeta.json";
import erc20SnapshotBalanceOfatMeta from "../../../contracts/interpreter/ops/erc20/snapshot/ERC20SnapshotBalanceOfAt.opmeta.json";
import erc20SnapshotTotalSupplyAtMeta from "../../../contracts/interpreter/ops/erc20/snapshot/ERC20SnapshotTotalSupplyAt.opmeta.json";
import erc721BalanceOfMeta from "../../../contracts/interpreter/ops/erc721/ERC721BalanceOf.opmeta.json";
import erc721OwnerOfMeta from "../../../contracts/interpreter/ops/erc721/ERC721OwnerOf.opmeta.json";
import ensureMeta from "../../../contracts/interpreter/ops/error/Ensure.opmeta.json";
import blockNumberMeta from "../../../contracts/interpreter/ops/evm/BlockNumber.opmeta.json";
import timestampMeta from "../../../contracts/interpreter/ops/evm/Timestamp.opmeta.json";
import explode32Meta from "../../../contracts/interpreter/ops/list/Explode32.opmeta.json";
import addMeta from "../../../contracts/interpreter/ops/math/Add.opmeta.json";
import divMeta from "../../../contracts/interpreter/ops/math/Div.opmeta.json";
import expMeta from "../../../contracts/interpreter/ops/math/Exp.opmeta.json";
import fixedPointScale18DivMeta from "../../../contracts/interpreter/ops/math/fixedPoint/FixedPointScale18Div.opmeta.json";
import fixedPointScale18Meta from "../../../contracts/interpreter/ops/math/fixedPoint/FixedPointScale18.opmeta.json";
import fixedPointScale18MulMeta from "../../../contracts/interpreter/ops/math/fixedPoint/FixedPointScale18Mul.opmeta.json";
import fixedPointScaleByMeta from "../../../contracts/interpreter/ops/math/fixedPoint/FixedPointScaleBy.opmeta.json";
import fixedPointScaleNMeta from "../../../contracts/interpreter/ops/math/fixedPoint/FixedPointScaleN.opmeta.json";
import anyMeta from "../../../contracts/interpreter/ops/math/logic/Any.opmeta.json";
import eagerIfMeta from "../../../contracts/interpreter/ops/math/logic/EagerIf.opmeta.json";
import equalToMeta from "../../../contracts/interpreter/ops/math/logic/EqualTo.opmeta.json";
import everyMeta from "../../../contracts/interpreter/ops/math/logic/Every.opmeta.json";
import greaterThanMeta from "../../../contracts/interpreter/ops/math/logic/GreaterThan.opmeta.json";
import isZeroMeta from "../../../contracts/interpreter/ops/math/logic/IsZero.opmeta.json";
import lessThanMeta from "../../../contracts/interpreter/ops/math/logic/LessThan.opmeta.json";
import maxMeta from "../../../contracts/interpreter/ops/math/Max.opmeta.json";
import minMeta from "../../../contracts/interpreter/ops/math/Min.opmeta.json";
import modMeta from "../../../contracts/interpreter/ops/math/Mod.opmeta.json";
import mulMeta from "../../../contracts/interpreter/ops/math/Mul.opmeta.json";
import saturatingAddMeta from "../../../contracts/interpreter/ops/math/saturating/SaturatingAdd.opmeta.json";
import saturatingMulMeta from "../../../contracts/interpreter/ops/math/saturating/SaturatingMul.opmeta.json";
import saturatingSubMeta from "../../../contracts/interpreter/ops/math/saturating/SaturatingSub.opmeta.json";
import subMeta from "../../../contracts/interpreter/ops/math/Sub.opmeta.json";
import iOrderBookV1VaultBalanceMeta from "../../../contracts/interpreter/ops/rain/IOrderBookV1/IOderBookV1VaultBalance.opmeta.json";
import iSaleV2RemainingTokenInventoryMeta from "../../../contracts/interpreter/ops/rain/ISaleV2/ISaleV2RemainingTokenInventory.opmeta.json";
import iSaleV2ReserveMeta from "../../../contracts/interpreter/ops/rain/ISaleV2/ISaleV2Reserve.opmeta.json";
import iSaleV2SaleStatusMeta from "../../../contracts/interpreter/ops/rain/ISaleV2/ISaleV2SaleStatus.opmeta.json";
import iSaleV2TokenMeta from "../../../contracts/interpreter/ops/rain/ISaleV2/ISaleV2Token.opmeta.json";
import iSaleV2TotalReserveReceivedMeta from "../../../contracts/interpreter/ops/rain/ISaleV2/ISaleV2TotalReserveReceived.opmeta.json";
import iVerifyV1AccountStatusAtTimeMeta from "../../../contracts/interpreter/ops/rain/IVerifyV1/IVerifyV1AccountStatusAtTime.opmeta.json";
import iTierV2ReportMeta from "../../../contracts/interpreter/ops/tier/ITierV2Report.opmeta.json";
import iTierV2ReportTimeForTierMeta from "../../../contracts/interpreter/ops/tier/ITierV2ReportTimeForTier.opmeta.json";
import saturatingDiffMeta from "../../../contracts/interpreter/ops/tier/SaturatingDiff.opmeta.json";
import selectLteMeta from "../../../contracts/interpreter/ops/tier/SelectLte.opmeta.json";
import updateTimesForTierRangeMeta from "../../../contracts/interpreter/ops/tier/UpdateTimesForTierRange.opmeta.json";
import OpMetaSchema from "../../../schema/meta/v0/op.meta.schema.json"
import path from "path";
import { deflateSync } from "zlib";
import fs from "fs";
import { resolve } from "path";
import { format } from "prettier";
import { metaFromBytes } from "../general";

/**
 * Generates list of file paths for all `.opmeta.json` files under `contracts/` directory.
 */
const getOpmetaFilePaths = () => {
  const opmetaFilePaths: string[] = [];

  function fromDir(startPath: string, filter: string) {
    if (!fs.existsSync(startPath)) {
      throw new Error(`Could not find path ${startPath}`);
    }

    const files = fs.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i]);
      const stat = fs.lstatSync(filename);
      if (stat.isDirectory()) {
        fromDir(filename, filter);
      } else if (filename.endsWith(filter)) {
        opmetaFilePaths.push(filename);
      }
    }
  }

  fromDir("./contracts", ".opmeta.json");

  return opmetaFilePaths;
};

/**
 * @public
 * All Rainterpreter opmetas
 */
export const getOpmetaList = () => {
  const opmetaFilePaths = getOpmetaFilePaths();

  const opmetaJson = [];

  for (let i = 0; i < opmetaFilePaths.length; i++) {
    const data = fs.readFileSync(opmetaFilePaths[i], { encoding: "utf8" });
    const json = JSON.parse(data);
    opmetaJson.push(json);
  }

  return opmetaJson;
};

/**
 * @public
 * All Rainterpreter opmetas
 */
export const rainterpreterOpmeta = getOpmetaList();

/**
 * @public
 * Constructs an enum-like object of opmeta names, which can be checked against the TypeScript `AllStandardOps` enum to verify it.
 */
export const getAllStandardOpsEnum = () => {
  const allStandardOps = {};

  rainterpreterOpmeta.forEach((opmeta, i_) => {
    allStandardOps[opmeta.name] = i_;
  });

  return { ...allStandardOps, length: rainterpreterOpmeta.length };
};

/**
 * @public
 * Compress and convert Rainterpreter opmetas to bytes
 * @returns hex string
 */
export const getRainterpreterOpMetaBytes = (): string => {
  const opmetaBytes = Uint8Array.from(
    deflateSync(
      format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
    )
  );
  let hex = "0x";
  for (let i = 0; i < opmetaBytes.length; i++) {
    hex =
      hex + opmetaBytes[i].toString(16).padStart(2, "0");
  }
  return hex;
};

/**
 * @public
 * Generate the JSON file of Rainterpreter opmeta
 *
 * @param path - The path to write the file on, default is the current path
 * @param fileName - The name of the file, default is "RainterpreterOpmeta"
 * @returns Rainterpreter opmeta json
 */
export const getRainterpreterOpMetaJson = (
  path?: string,
  fileName?: string
) => {
  if (!path) path = __dirname;
  path = resolve(path);
  if (!fileName) fileName = "RainterpreterOpmeta";
  try {
    fs.writeFileSync(
      path + "/" + fileName + ".json",
      format(JSON.stringify(rainterpreterOpmeta, null, 4), { parser: "json" })
    );
  } catch (error) {
    console.log(error);
  }
};

/**
 * @public
 * Decompress and convert bytes to Rainterpreter op metas
 *
 * @param bytes - Bytes to decompress and convert back to json meta
 * @param path - Path to write the results to if having the output as a json file is desired
 * @returns
 */
export const getRainterpreterOpMetaFromBytes = (
  bytes: string | Uint8Array,
  path?: string
) => {
  return metaFromBytes(bytes, OpMetaSchema, path)
}