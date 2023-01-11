import { chainlinkOraclePriceMeta } from "./chainlink/ChainlinkOraclePriceMeta";
import { callMeta } from "./core/CallMeta";
import { contextMeta } from "./core/ContextMeta";
import { contextRowMeta } from "./core/ContextRowMeta";
import { debugMeta } from "./core/DebugMeta";
import { doWhileMeta } from "./core/DoWhileMeta";
import { foldContextMeta } from "./core/FoldContextMeta";
import { getMeta } from "./core/GetMeta";
import { loopNMeta } from "./core/LoopNMeta";
import { readMemoryMeta } from "./core/ReadMemoryMeta";
import { setMeta } from "./core/SetMeta";
import { hashMeta } from "./crypto/HashMeta";
import { erc1155BalanceOfMeta } from "./erc1155/ERC1155BalanceOfBatchMeta";
import { erc1155BalanceOfBatchMeta } from "./erc1155/ERC1155BalanceOfMeta";
import { erc20BalanceOfMeta } from "./erc20/ERC20BalanceOfMeta";
import { erc20TotalSupplyMeta } from "./erc20/ERC20TotalSupplyMeta";
import { erc20SnapshotBalanceOfatMeta } from "./erc20/snapshot/ERC20SnapshotBalanceOfAtMeta";
import { erc20SnapshotTotalSupplyAtMeta } from "./erc20/snapshot/ERC20SnapshotTotalSupplyAtMeta";
import { erc721BalanceOfMeta } from "./erc721/ERC721BalanceOfMeta";
import { erc721OwnerOfMeta } from "./erc721/ERC721OwnerOfMeta";
import { ensureMeta } from "./error/EnsureMeta";
import { blockNumberMeta } from "./evm/BlockNumberMeta";
import { timestampMeta } from "./evm/TimestampMeta";
import { explode32Meta } from "./list/Explode32Meta";
import { addMeta } from "./math/AddMeta";
import { divMeta } from "./math/DivMeta";
import { expMeta } from "./math/ExpMeta";
import { fixedPointScale18DivMeta } from "./math/fixedPoint/FixedPointScale18DivMeta";
import { fixedPointScale18Meta } from "./math/fixedPoint/FixedPointScale18Meta";
import { fixedPointScale18MulMeta } from "./math/fixedPoint/FixedPointScale18MulMeta";
import { fixedPointScaleByMeta } from "./math/fixedPoint/FixedPointScaleByMeta";
import { fixedPointScaleNMeta } from "./math/fixedPoint/FixedPointScaleNMeta";
import { anyMeta } from "./math/logic/AnyMeta";
import { eagerIfMeta } from "./math/logic/EagerIfMeta";
import { equalToMeta } from "./math/logic/EqualToMeta";
import { everyMeta } from "./math/logic/EveryMeta";
import { greaterThanMeta } from "./math/logic/GreaterThanMeta";
import { isZeroMeta } from "./math/logic/IsZeroMeta";
import { lessThanMeta } from "./math/logic/LessThanMeta";
import { maxMeta } from "./math/MaxMeta";
import { minMeta } from "./math/MinMeta";
import { modMeta } from "./math/ModMeta";
import { mulMeta } from "./math/MulMeta";
import { saturatingAddMeta } from "./math/saturating/SaturatingAddMeta";
import { saturatingMulMeta } from "./math/saturating/SaturatingMulMeta";
import { saturatingSubMeta } from "./math/saturating/SaturatingSubMeta";
import { subMeta } from "./math/SubMeta";
import { iOrderBookV1VaultBalanceMeta } from "./rain/IOrderBookV1/IOderBookV1VaultBalanceMeta";
import { iSaleV2RemainingTokenInventoryMeta } from "./rain/ISaleV2/ISaleV2RemainingTokenInventoryMeta";
import { iSaleV2ReserveMeta } from "./rain/ISaleV2/ISaleV2ReserveMeta";
import { iSaleV2SaleStatusMeta } from "./rain/ISaleV2/ISaleV2SaleStatusMeta";
import { iSaleV2TokenMeta } from "./rain/ISaleV2/ISaleV2TokenMeta";
import { iSaleV2TotalReserveReceivedMeta } from "./rain/ISaleV2/ISaleV2TotalReserveReceivedMeta";
import { iVerifyV1AccountStatusAtTimeMeta } from "./rain/IVerifyV1/IVerifyV1AccountStatusAtTimeMeta";
import { iTierV2ReportMeta } from "./tier/ITierV2ReportMeta";
import { iTierV2ReportTimeForTierMeta } from "./tier/ITierV2ReportTimeForTierMeta";
import { saturatingDiffMeta } from "./tier/SaturatingDiffMeta";
import { selectLteMeta } from "./tier/SelectLteMeta";
import { updateTimesForTierRangeMeta } from "./tier/UpdateTimesForTierRangeMeta";
import { OpMeta } from "./types";

/**
 * @public
 * 
 */
export const rainterpreterOpmeta: OpMeta[] = [
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
