// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RedeemableERC20} from "../redeemableERC20/RedeemableERC20.sol";

contract ERC20PulleeTest {
    using SafeERC20 for IERC20;

    function approve(
        address token_,
        address recipient_,
        uint256 amount_
    ) external {
        IERC20(token_).safeIncreaseAllowance(recipient_, amount_);
    }

    function transfer(
        address token_,
        address recipient_,
        uint256 amount_
    ) external {
        IERC20(token_).transfer(recipient_, amount_);
    }

    function burnDistributors(address token_, address[] calldata distributors_)
        external
    {
        RedeemableERC20(token_).burnDistributors(distributors_);
    }

    function grantSender(address token_, address sender_) external {
        RedeemableERC20(token_).grantSender(sender_);
    }

    function grantReceiver(address token_, address receiver_) external {
        RedeemableERC20(token_).grantReceiver(receiver_);
    }

    function redeem(
        address token_,
        IERC20[] calldata assets_,
        uint256 amount_
    ) external {
        RedeemableERC20(token_).redeem(assets_, amount_);
    }
}
