// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ReserveNFT is ERC721 {
    mapping(address => bool) public freezables;

    uint256 public totalSupply;
    uint256 public maxSupply;

    /// Define and mint the erc20 token.
    constructor() ERC721("NON FUNGIBLE TOKEN", "NFT") {
        maxSupply = 10000;
    }

    /// Add an account to the freezables list.
    /// @param account_ The account to freeze.
    function addFreezable(address account_) external {
        freezables[account_] = true;
    }

    /// Function ti Mint NFTs
    function mint(address _address, uint256 _amount) external {
        require(totalSupply + _amount <= maxSupply,"Max limit reached.");
        for(uint256 i = 0; i < _amount; i=i+1){
            totalSupply++;
            _mint(_address, totalSupply);
        }
    }

    /// Block any transfers to a frozen account.
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        require(!freezables[receiver_], "FROZEN");
    }

    function tokenURI(uint256 tokenId) public view virtual override 
    returns(string memory){
        return "URI";
    }
}