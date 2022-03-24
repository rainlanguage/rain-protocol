// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

import {IVerifyCallback, Evidence} from "../verify/IVerifyCallback.sol";

// Test contract for testing Verify hooks after adding, approving, banning or
// removing an account.
// All logic here is for testing purposes and should not necessarily be used in
// an actual Verify callback contract.
contract VerifyCallbackTest is IVerifyCallback {
    /// Account => Boolean
    mapping(address => bool) public additions;
    mapping(address => bool) public approvals;
    mapping(address => bool) public bans;
    mapping(address => bool) public removals;

    function afterAdd(
        address adder_,
        Evidence calldata evidence_
    ) external virtual override {
        require(adder_ != address(0), "0_ADDRESS");
        require(!additions[evidence_.account], "PRIOR_ADD");
        require(
            keccak256(evidence_.data) == keccak256(bytes("Good")),
            "BAD_EVIDENCE"
        );
        additions[evidence_.account] = true;
    }

    function afterApprove(
        address approver_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(approver_ != address(0), "0_ADDRESS");
        for (uint256 index = 0; index < evidences_.length; index++) {
            require(!approvals[evidences_[index].account], "PRIOR_APPROVE");
            require(
                keccak256(evidences_[index].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            approvals[evidences_[index].account] = true;
        }
    }

    function afterBan(
        address banner_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(banner_ != address(0), "0_ADDRESS");
        for (uint256 index = 0; index < evidences_.length; index++) {
            require(!bans[evidences_[index].account], "PRIOR_BAN");
            require(
                keccak256(evidences_[index].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            bans[evidences_[index].account] = true;
        }
    }

    function afterRemove(
        address remover_,
        Evidence[] calldata evidences_
    ) external virtual override {
        require(remover_ != address(0), "0_ADDRESS");
        for (uint256 index = 0; index < evidences_.length; index++) {
            require(!removals[evidences_[index].account], "PRIOR_REMOVE");
            require(
                keccak256(evidences_[index].data) == keccak256(bytes("Good")),
                "BAD_EVIDENCE"
            );
            removals[evidences_[index].account] = true;
        }
    }
}