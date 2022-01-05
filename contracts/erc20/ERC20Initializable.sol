// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./ERC20Config.sol";

/// @title ERC20Initializable
/// @notice Extends the Open Zeppelin `ERC20` base contract to be compatible
/// with Open Zeppelin `Initializable`. It sends empty name/string values to
/// the base `ERC20` constructor then allows `ERC20Config` to be passed into
/// `initializeERC20` so that cloned erc20 contracts can initialize with new
/// name and symbol, also referenced and returned by the overridden `name` and
/// `symbol` functions.
contract ERC20Initializable is ERC20 {

    /// ERC20 Name as set during `initializeERC20`.
    string private initializedName;
    /// ERC20 Symbol as set during `initializeERC20`.
    string private initializedSymbol;

    // solhint-disable-next-line no-empty-blocks
    constructor () ERC20("", "") { }

    /// Initialize the name and symbol such that two clones can have different
    /// values for name and symbol initialized outside the `ERC20` constructor.
    /// @param config_ `ERC20Config` values for name and symbol.
    function initializeERC20(ERC20Config memory config_)
        internal
    {
        // Byte length checks are a guard only against an incorrect
        // implementation. This function should only be called ONCE by an
        // `Initializable` contract.
        assert(bytes(initializedName).length < 1);
        assert(bytes(initializedSymbol).length < 1);
        initializedName = config_.name;
        initializedSymbol = config_.symbol;
    }

    /// @inheritdoc ERC20
    function name() public view override virtual returns (string memory) {
        return initializedName;
    }

    /// @inheritdoc ERC20
    function symbol() public view override virtual returns (string memory) {
        return initializedSymbol;
    }
}