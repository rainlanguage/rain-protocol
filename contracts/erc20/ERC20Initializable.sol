// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./ERC20Config.sol";

contract ERC20Initializable is ERC20 {

    string private initializedName;
    string private initializedSymbol;

    // solhint-disable-next-line no-empty-blocks
    constructor () ERC20("", "") { }

    function initializeERC20(ERC20Config memory config_)
        internal
    {
        initializedName = config_.name;
        initializedSymbol = config_.symbol;
    }

    function name() public view override virtual returns (string memory) {
        return initializedName;
    }

    function symbol() public view override virtual returns (string memory) {
        return initializedSymbol;
    }
}