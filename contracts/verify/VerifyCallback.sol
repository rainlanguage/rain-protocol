// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import "./IVerifyCallbackV1.sol";
import {OwnableUpgradeable as Ownable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/// @title VerifyCallback
/// Implements empty virtual functions for every function in `IVerifyCallbackV1`
/// so that inheriting contracts only have to override the callbacks they need
/// to define logic for.
contract VerifyCallback is IVerifyCallbackV1, Ownable {
    function verifyCallbackInit() internal onlyInitializing {
        __Ownable_init();
    }

    function afterAdd(
        address adder_,
        Evidence[] calldata evidences_
    )
        public
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterApprove(
        address approver_,
        Evidence[] calldata evidences_
    )
        public
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterBan(
        address banner_,
        Evidence[] calldata evidences_
    )
        public
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterRemove(
        address remover_,
        Evidence[] calldata evidences_
    )
        public
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
