// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

//solhint-disable-next-line max-line-length
import {TrustEscrow, EscrowStatus} from "../../escrow/TrustEscrow.sol";

/// @title TrustEscrowWrapper
/// Thin wrapper around the `TrustEscrow` contract (and, implicitly, also
/// `TrustMutableAddressesTest`) with accessors to facilitate hardhat unit
/// testing of `internal` functions and variables.
contract TrustEscrowWrapper is TrustEscrow {
    function getReserve(address trust_) external view returns (address) {
        return reserves[trust_];
    }

    function getToken(address trust_) external view returns (address) {
        return tokens[trust_];
    }

    function getCrp(address trust_) external view returns (address) {
        return crps[trust_];
    }

    function getEscrowStatus(address trust_)
        external
        view
        returns (EscrowStatus)
    {
        return escrowStatuses[trust_];
    }

    function fetchReserve(address trust_) external {
        reserve(trust_);
    }

    function fetchToken(address trust_) external {
        token(trust_);
    }

    function fetchCrp(address trust_) external {
        crp(trust_);
    }

    function fetchEscrowStatus(address trust_) external {
        escrowStatus(trust_);
    }
}
