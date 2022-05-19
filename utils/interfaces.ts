import { Contract } from "ethers";
import { RedeemableERC20Factory } from "../typechain/RedeemableERC20Factory";

export interface Factories {
  redeemableERC20Factory: RedeemableERC20Factory & Contract;
}
