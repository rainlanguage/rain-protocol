// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {ERC1155Upgradeable as ERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC1155BurnableUpgradeable as ERC1155Burnable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155BurnableUpgradeable.sol";

/// @title ReserveTokenERC1155
// Extremely basic ERC1155 implementation for testing purposes.
contract ReserveTokenERC1155 is ERC1155, ERC1155Burnable {
    // Stables such as USDT and USDC commonly have 6 decimals.
    uint256 public constant DECIMALS = 6;
    // One _billion_ dollars 👷😈.
    uint256 public constant TOTAL_SUPPLY = 10 ** (DECIMALS + 9);

    // Incremented token count for use as id for newly minted tokens.
    uint256 public tokenCount;

    /// Define and mint a erc1155 token.
    function initialize() external initializer {
        __ERC1155_init("");
        tokenCount = 0;
        _mint(msg.sender, tokenCount, TOTAL_SUPPLY, "");
    }

    function mintNewToken() external {
        tokenCount++;
        _mint(msg.sender, tokenCount, TOTAL_SUPPLY, "");
    }
}
