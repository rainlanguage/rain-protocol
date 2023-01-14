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
import { deflateSync } from "zlib";

/**
 * @public
 * All Rainterpreter opmetas
 */
export const rainterpreterOpmeta = [
  chainlinkOraclePriceMeta,
  callMeta,
  contextMeta,
  contextRowMeta,
  debugMeta,
  doWhileMeta,
  foldContextMeta,
  getMeta,
  loopNMeta,
  readMemoryMeta,
  setMeta,
  hashMeta,
  erc20BalanceOfMeta,
  erc20TotalSupplyMeta,
  erc20SnapshotBalanceOfatMeta,
  erc20SnapshotTotalSupplyAtMeta,
  erc721BalanceOfMeta,
  erc721OwnerOfMeta,
  erc1155BalanceOfMeta,
  erc1155BalanceOfBatchMeta,
  ensureMeta,
  blockNumberMeta,
  timestampMeta,
  explode32Meta,
  fixedPointScale18Meta,
  fixedPointScale18DivMeta,
  fixedPointScale18MulMeta,
  fixedPointScaleByMeta,
  fixedPointScaleNMeta,
  anyMeta,
  eagerIfMeta,
  equalToMeta,
  everyMeta,
  greaterThanMeta,
  isZeroMeta,
  lessThanMeta,
  saturatingAddMeta,
  saturatingMulMeta,
  saturatingSubMeta,
  addMeta,
  divMeta,
  expMeta,
  maxMeta,
  minMeta,
  modMeta,
  mulMeta,
  subMeta,
  iOrderBookV1VaultBalanceMeta,
  iSaleV2RemainingTokenInventoryMeta,
  iSaleV2ReserveMeta,
  iSaleV2SaleStatusMeta,
  iSaleV2TokenMeta,
  iSaleV2TotalReserveReceivedMeta,
  iVerifyV1AccountStatusAtTimeMeta,
  iTierV2ReportMeta,
  iTierV2ReportTimeForTierMeta,
  saturatingDiffMeta,
  selectLteMeta,
  updateTimesForTierRangeMeta
]
/**
 * @public
 * Compress and convert Rainterpreter opmetas to bytes
 * 
 * @returns bytes
 */
export const getRainterpreterOpmetaBytes = (): Uint8Array => {
  return deflateSync(
      JSON.stringify(rainterpreterOpmeta, null, 4)
  )
}
