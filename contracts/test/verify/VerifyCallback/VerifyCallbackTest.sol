// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {IVerifyCallbackV1, Evidence} from "../../../verify/IVerifyCallbackV1.sol";

// Test contract for testing Verify hooks after adding, approving, banning or
// removing an account.
// All logic here is for testing purposes and should not necessarily be used in
// an actual Verify callback contract.
contract VerifyCallbackTest is IVerifyCallbackV1 {
    /// Account => Boolean
    mapping(address => bool) public additions;
    mapping(address => bool) public approvals;
    mapping(address => bool) public bans;
    mapping(address => bool) public removals;

    function afterAdd(
        address adder_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(adder_ != address(0), "0_ADDRESS");
        for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
            require(!additions[evidences_[i_].account], "PRIOR_ADD");
            require(
                keccak256(evidences_[i_].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            additions[evidences_[i_].account] = true;
        }
    }

    function afterApprove(
        address approver_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(approver_ != address(0), "0_ADDRESS");
        for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
            require(!approvals[evidences_[i_].account], "PRIOR_APPROVE");
            require(
                keccak256(evidences_[i_].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            // Require that added callback already triggered
            require(additions[evidences_[i_].account], "NOT_ADDED_CALLBACK");
            approvals[evidences_[i_].account] = true;
        }
    }

    function afterBan(
        address banner_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(banner_ != address(0), "0_ADDRESS");
        for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
            require(!bans[evidences_[i_].account], "PRIOR_BAN");
            require(
                keccak256(evidences_[i_].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            // Require that added callback already triggered
            require(additions[evidences_[i_].account], "NOT_ADDED_CALLBACK");
            bans[evidences_[i_].account] = true;
        }
    }

    function afterRemove(
        address remover_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(remover_ != address(0), "0_ADDRESS");
        for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
            require(!removals[evidences_[i_].account], "PRIOR_REMOVE");
            require(
                keccak256(evidences_[i_].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            // Require that added callback already triggered
            require(additions[evidences_[i_].account], "NOT_ADDED_CALLBACK");
            removals[evidences_[i_].account] = true;
        }
    }
}
