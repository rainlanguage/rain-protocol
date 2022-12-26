// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {AddressUpgradeable as Address} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import "../../ierc3156/IERC3156FlashLender.sol";
import "../../ierc3156/IERC3156FlashBorrower.sol";
import "../IOrderBookV1.sol";

// input = USDT
// output = DAI
// maximumIORatio = 1.01
// minimumInput = 100
// maximumInput = infinity

// flash loan amount = minimumInput = 100

// - some trust has threshold 1% and 100 USDT in the associated vault
// - 0x is offering 102 DAI per 100 USDT
// - you flash loan 100 USDT from OB or somewhere else
// - you sell the 100 USDT to 0x for 102 DAI
// - give 101 DAI to the trust order and it gives you 100 USDT
// - the trust now has 101 DAI in it and 0 USDT
// - you have 100 USDT and 1 DAI
// - you pay back the 100 USDT flash loan
// - you have 1 DAI profit and the trust swapped 100 USDT for 101 DAI

// i think the way to do this if the OB is the flash lender is to have it track debt:
// - same setup as above
// - bot floash loans 100 USDT from OB, OB records the 100 USDT debt
// - bot sells 100 USDT to 0x for 102 DAI
// - bot takesOrder of the trust for 101 DAI and OB _reduces the flash loan debt_ by 100USDT
// - the trust now has 101 DAI and 0 USDT
// - the bot has 1 DAI and 0 USDT
// - OB considers the flash loan repaid so allows the transaction to complete

/// https://github.com/0xProject/0x-api-starter-guide-code/blob/master/contracts/SimpleTokenSwap.sol
contract ZeroExOrderBookFlashBorrower is IERC3156FlashBorrower {
    using Address for address;
    using SafeERC20 for IERC20;

    address public immutable orderBook;
    address public immutable zeroExExchangeProxy;

    constructor(address orderBook_, address zeroExExchangeProxy_) {
        orderBook = orderBook_;
        zeroExExchangeProxy = zeroExExchangeProxy_;
    }

    function onFlashLoan(
        address initiator_,
        address,
        uint256,
        uint256,
        bytes calldata data_
    ) external returns (bytes32) {
        require(msg.sender == orderBook, "FlashBorrower: Bad lender");
        require(initiator_ == address(this), "FlashBorrower: Bad initiator");

        (TakeOrdersConfig memory takeOrders_, bytes memory zeroExData_) = abi
            .decode(data_, (TakeOrdersConfig, bytes));

        // Call the encoded swap function call on the contract at `swapTarget`,
        // passing along any ETH attached to this function call to cover protocol fees.
        zeroExExchangeProxy.functionCallWithValue(
            zeroExData_,
            address(this).balance
        );

        IOrderBookV1(orderBook).takeOrders(takeOrders_);

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function arb(
        TakeOrdersConfig calldata takeOrders_,
        address zeroExSpender_,
        bytes calldata zeroExData_
    ) external {
        bytes memory data_ = abi.encode(takeOrders_, zeroExData_);
        // The token we receive from taking the orders is what we will use to
        // repay the flash loan.
        address flashLoanToken_ = takeOrders_.input;
        // We can't repay more than the minimum that the orders are going to
        // give us and there's no reason to borrow less.
        uint256 flashLoanAmount_ = takeOrders_.minimumInput;

        // This is overkill to infinite approve every time.
        // @todo make this hammer smaller.
        IERC20(takeOrders_.output).safeApprove(orderBook, 0);
        IERC20(takeOrders_.output).safeIncreaseAllowance(
            orderBook,
            type(uint256).max
        );
        IERC20(takeOrders_.input).safeApprove(zeroExSpender_, 0);
        IERC20(takeOrders_.input).safeIncreaseAllowance(
            zeroExSpender_,
            type(uint256).max
        );

        IERC3156FlashLender(orderBook).flashLoan(
            this,
            flashLoanToken_,
            flashLoanAmount_,
            data_
        );

        // Refund any unspent 0x protocol fees to the sender.
        payable(msg.sender).transfer(address(this).balance);

        uint256 inputBalance_ = IERC20(takeOrders_.input).balanceOf(
            address(this)
        );
        if (inputBalance_ > 0) {
            IERC20(takeOrders_.input).safeTransfer(msg.sender, inputBalance_);
        }
        uint256 outputBalance_ = IERC20(takeOrders_.output).balanceOf(
            address(this)
        );
        if (outputBalance_ > 0) {
            IERC20(takeOrders_.output).safeTransfer(msg.sender, outputBalance_);
        }
    }
}
