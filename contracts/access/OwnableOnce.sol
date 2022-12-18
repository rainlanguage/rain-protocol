// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title OwnableOnce
/// @notice Inspired by the near ubiquitous Open Zeppelin `Ownable` contract.
///
/// Enforces that `msg.sender` is the owner BUT UNLIKE Open Zeppelin DOES NOT
/// allow transfer/reassignment of the owner. DOES NOT assume that the deployer
/// is the owner, as that's almost never what we want for a factory deployment.
/// DOES assume that the owner is some other immutable contract that the owned
/// contract is entering an immutable and formal trust relationship with the
/// owner's _bytecode_ so any change of ownership is implicitly a security
/// critical bug. By removing the ownership transfer codepath we avoid footguns
/// for otherwise immutable deployments and can reduce code bloat.
///
/// Other than immutability of the owner state `OwnableOnce` mimics `Ownable`
/// with its view interface, modifiers, events, errors, etc.
///
/// As the owner is NOT set to the deployer initially, care MUST be take by the
/// deployer to ensure that the owner is set atomically either with a constructor
/// or initialization in the same transaction as the deployment.
contract OwnableOnce {

    /// Mimics Open Zeppelin `OwnershipTransferred` event.
    /// For `OwnableOnce` the old owner will ALWAYS be `address(0)` so it seems
    /// redundant, and also gas wasteful to include the `indexed` keyword.
    /// The benefit is compatibility with existing systems that expect the
    /// Open Zeppelin event data layout.
    /// @param previousOwner As per Open Zeppelin.
    /// @param newOwner as per Open Zeppelin.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// Mimics Open Zeppelin `owner` being an externally callable view function.
    address public owner;

    /// Mimics Open Zeppelin `onlyOwner` modifier down to the same error message.
    modifier onlyOwner() {
        require(owner == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    /// Sets the owner if and only if it has never been set before. This is
    /// internal so that Solidity does not generate additional code that may be
    /// more useless bloat/foot-gun. The inheriting contract can always expose
    /// its own external function wrapping this if it needs to be exposed.
    /// e.g. a factory contract may need to be able to call an external wrapper.
    /// @param owner_ The owner of this contract.
    function _setOwnerOnce(address owner_) internal {
        require(owner == address(0), "Ownable: owner already exists");
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }
}