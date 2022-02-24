// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// solhint-disable-next-line max-line-length
import {ERC721Burnable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

/// @title ReserveTokenERC721
// Extremely basic ERC721 implementation for testing purposes.
contract ReserveTokenERC721 is ERC721, ERC721Burnable {
    // Incremented token count for use as id for newly minted tokens.
    uint256 public tokenCount;

    /// Define and mint a erc721 token.
    constructor() ERC721("Test NFT", "TNFT") {
        tokenCount = 0;
        _mint(msg.sender, tokenCount);
    }

    function mintNewToken() external {
        tokenCount++;
        _mint(msg.sender, tokenCount);
    }
}
