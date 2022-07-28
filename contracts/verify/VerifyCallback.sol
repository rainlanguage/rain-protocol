// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./IVerifyCallback.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VerifyCallback
/// Implements empty virtual functions for every function in `IVerifyCallback`
/// so that inheriting contracts only have to override the callbacks they need
/// to define logic for.
contract VerifyCallback is IVerifyCallback, Ownable {
    function afterAdd(address adder_, Evidence[] calldata evidences_)
        external
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterApprove(address approver_, Evidence[] calldata evidences_)
        external
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterBan(address banner_, Evidence[] calldata evidences_)
        external
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function afterRemove(address remover_, Evidence[] calldata evidences_)
        external
        virtual
        override
        onlyOwner
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
