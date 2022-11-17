// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../ierc3156/IERC3156FlashLender.sol";
import "../../ierc3156/IERC3156FlashBorrower.sol";

contract ZeroExOrderBookFlashBorrower is IERC3156FlashBorrower {
    IERC3156FlashLender immutable lender;
    constructor(address lender_) {
        lender = IERC3156FlashLender(lender_);
    }
    function onFlashLoan(address initiator_, address token_, uint amount_, uint fee_, bytes calldata data_) external returns (bytes32) {
        require(
            msg.sender == address(lender),
            "FlashBorrower: Untrusted lender"
        );
        require(
            initiator_ == address(this),
            "FlashBorrower: Untrusted loan initiator"
        );

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}