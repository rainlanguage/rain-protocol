// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/Ownable.sol";

library OpOwner {
    function _owner(uint contract_) internal view returns (uint owner_) {
        owner_ = Ownable(address(uint160(contract_))).owner();
    }

    function integrity(IntegrityState memory integrityState_)
}