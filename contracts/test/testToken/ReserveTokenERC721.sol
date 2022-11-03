// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {ERC721Upgradeable as ERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ERC721BurnableUpgradeable as ERC721Burnable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";

/// @title ReserveTokenERC721
// Extremely basic ERC721 implementation for testing purposes.
contract ReserveTokenERC721 is ERC721, ERC721Burnable {
    // Incremented token count for use as id for newly minted tokens.
    uint256 public tokenCount;

    /// Define and mint a erc721 token.
    function initialize() external initializer {
        __ERC721_init("Test NFT", "TNFT");
        tokenCount = 0;
        _mint(msg.sender, tokenCount);
    }

    function mintNewToken() external {
        tokenCount++;
        _mint(msg.sender, tokenCount);
    }
}
