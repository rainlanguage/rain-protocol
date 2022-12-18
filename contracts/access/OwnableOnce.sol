// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

/// @title OwnableOnce
/// @notice Inspired by the near ubiquitous Open Zeppelin `Ownable` contract.
///
/// Enforces that `msg.sender` is the owner BUT UNLIKE Open Zeppelin DOES NOT
/// allow transfer/reassignment of the owner. DOES NOT assume that the deployer
/// is the _final_ owner, as that's almost never what we want for a factory
/// deployment. The `msg.sender` at construction time MAY set the owner once
/// at any time during construction or later, after which no further ownership
/// changes are possible. The assumption is that the owner is some other
/// immutable contract that the owned contract is entering an immutable and
/// formal trust relationship with the owner's _bytecode_ so any change of
/// ownership is implicitly a security critical bug. By removing the ownership
/// transfer codepath we avoid footguns for otherwise immutable deployments and
/// can reduce code bloat.
///
/// Other than immutability of the owner state `OwnableOnce` mimics `Ownable`
/// with its view interface, modifiers, events, errors, etc. BUT ONLY for the
/// _finalised_ owner. The deployer-owner never appears in events or public reads
/// of `owner` and has no access to `onlyOwner` gated logic.
contract OwnableOnce {

    /// Mimics Open Zeppelin `OwnershipTransferred` event.
    /// For `OwnableOnce` the old owner will ALWAYS be `address(0)` so it seems
    /// redundant, and also gas wasteful to include the `indexed` keyword.
    /// The benefit is compatibility with existing systems that expect the
    /// Open Zeppelin event data layout.
    /// @param previousOwner As per Open Zeppelin.
    /// @param newOwner as per Open Zeppelin.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @dev True once the ownership has been finalised.
    bool private finalised;
    /// @dev The deployer-owner during construction and until the final owner is
    /// set, then the final owner.
    address private _owner;

    /// The initial owner is the address that constructed the contract.
    constructor () {
        _owner = msg.sender;
    }

    /// Mimics Open Zeppelin internal logic for ownership checks.
    function _checkOwner() internal view {
        require(_owner == msg.sender, "Ownable: caller is not the owner");
    }

    /// Mimics Open Zeppelin `onlyOwner` modifier down to the same error message.
    /// DOES NOT allow the unfinalised owner to access any `onlyOwner` gated
    /// functionality. Only the _finalised_ owner has access.
    modifier onlyOwner() {
        require(finalised, "Ownable: owner not final");
        _checkOwner();
        _;
    }

    /// Sets the owner if and only if it has never been set before. This is
    /// internal so that Solidity does not generate additional code that may be
    /// more useless bloat/foot-gun. The inheriting contract can always expose
    /// its own external function wrapping this if it needs to be exposed.
    /// e.g. a factory contract may need to be able to call an external wrapper.
    /// @param owner_ The final owner of this contract.
    function _setOwnerOnce(address owner_) internal {
        require(!finalised, "Ownable: owner is final");
        _checkOwner();
        _owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /// Mimics Open Zeppelin `owner` function but hides the deployer-owner and
    /// so will only ever return `address(0)` or the final owner.
    function owner() external view returns (address) {
        return finalised ? _owner : address(0);
    }
}