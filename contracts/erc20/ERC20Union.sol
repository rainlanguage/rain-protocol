// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20Union is IERC20 {
    address[] private tokens;

    constructor(address[] memory tokens_) {
        tokens = tokens_;
    }

    modifier unimplemented() {
        _;
        revert("UNIMPLEMENTED");
    }

    function allowance(address, address)
        external
        view
        unimplemented
        returns (uint256)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function approve(address, uint256)
        external
        unimplemented
        returns (bool)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function transfer(address, uint256)
        external
        unimplemented
        returns (bool)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function transferFrom(
        address,
        address,
        uint256
    )
        external
        unimplemented
        returns (bool)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function balanceOf(address account_) external view returns (uint256) {
        uint256 accumulator_;
        address[] memory tokens_ = tokens;
        for (uint256 i_ = 0; i_ < tokens_.length; i_++) {
            accumulator_ += IERC20(tokens_[i_]).balanceOf(account_);
        }
        return accumulator_;
    }

    function totalSupply() external view returns (uint256) {
        uint256 accumulator_;
        address[] memory tokens_ = tokens;
        for (uint256 i_ = 0; i_ < tokens_.length; i_++) {
            accumulator_ += IERC20(tokens_[i_]).totalSupply();
        }
        return accumulator_;
    }
}
