// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { IFactory } from "./IFactory.sol";

/// @title FactoryTruster
/// @notice `FactoryTruster` is an abstract contract that allows an
/// implementing contract to make explicit and enforce that it TRUSTS any and
/// every contract deployed as a child of the relevant `IFactory` contract.
/// This is important and useful because a `FactoryTruster` can rely on far
/// stronger security guarantees about contracts with known bytecode than a
/// mere interface, even if the children's constructors are paramaterised.
///
/// For example, an `IERC20` interface specifies a set of function signatures
/// that we can trust to send/receive binary data to/from according to the ABI
/// but it does nothing to enforce that a `transfer` does anything in
/// particular at all. Did the token balances update as we expect? Will this be
/// a reentrant call? Will the `transfer` error and rollback everything in the
/// current transaction? A mere interface answers none of these questions. Defi
/// is littered with catastrophic failures due to putting too much emphasis on
/// how the contract on the other side of an interface "should" work,
/// inappropriately elevating an interface from being an interoperability
/// concern to pretending it provides some security/behaviour guarantee.
///
/// Technically we face the same problem for `IFactory`. A mere interface does
/// NOT guarantee us that the contract on the other side of `IFactory` is
/// reliably deploying anything in particular. An arbitrary `IFactory` can
/// deploy N safe contracts then deploy malicious code on the N+1th deployment.
/// For this reason a `FactoryTruster` MUST explicitly choose a SPECIFIC
/// factory to trust that has been thoroughly audited to earn that trust.
///
/// Obviously trusting only specified factories limits the `FactoryTruster`
/// contract to be less lego-like in that it no longer supports an interface
/// but instead only supports an implementation. If it is safe and efficient to
/// do so, it is always better to target interface support for a contract, but
/// there are times that it is better to lean on a well known implementation.
abstract contract FactoryTruster {
    IFactory public immutable trustedFactory;

    constructor(IFactory trustedFactory_) {
        trustedFactory = trustedFactory_;
    }

    modifier onlyTrustedFactoryChild(address maybeChild_) {
        require(trustedFactory.isChild(maybeChild_), "NOT_TRUSTED_CHILD");
        _;
    }
}