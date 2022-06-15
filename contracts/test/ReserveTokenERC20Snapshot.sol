// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";

/// @title ReserveTokenERC20Snapshot
/// A test token that can be used as a reserve asset.
/// On mainnet this would likely be some brand of stablecoin but can be
/// anything.
/// Notably mimics 6 decimals commonly used by stables in production.
contract ReserveTokenERC20Snapshot is ERC20Snapshot {
    // Stables such as USDT and USDC commonly have 6 decimals.
    uint256 public constant DECIMALS = 6;
    // One _billion_ dollars 👷😈.
    uint256 public constant TOTAL_SUPPLY = 10**(DECIMALS + 9);

    /// Define and mint the erc20 token.
    constructor() ERC20("USD Classic", "USDCC") {
        _mint(msg.sender, TOTAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return uint8(DECIMALS);
    }

    /// Take a snapshot of the current balances and total supply.
    function snapshot() external {
        _snapshot();
    }
}
