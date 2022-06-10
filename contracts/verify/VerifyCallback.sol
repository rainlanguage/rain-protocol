// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./IVerifyCallback.sol";

/// @title VerifyCallback
/// Implements empty virtual functions for every function in `IVerifyCallback`
/// so that inheriting contracts only have to override the callbacks they need
/// to define logic for.
contract VerifyCallback is IVerifyCallback {
    function afterAdd(address adder_, Evidence[] calldata evidences_)
        external
        virtual
        override
    {}

    function afterApprove(address approver_, Evidence[] calldata evidences_)
        external
        virtual
        override
    {}

    function afterBan(address banner_, Evidence[] calldata evidences_)
        external
        virtual
        override
    {}

    function afterRemove(address remover_, Evidence[] calldata evidences_)
        external
        virtual
        override
    {}
}
