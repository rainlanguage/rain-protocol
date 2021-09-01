## `BalancerOwnable`



Contract module which provides a basic access control mechanism, where
there is an account (an owner) that can be granted exclusive access to
specific functions.

By default, the owner account will be the one that deploys the contract. This
can later be changed with {transferOwnership}.

This module is used through inheritance. It will make available the modifier
`onlyOwner`, which can be applied to your functions to restrict their use to
the owner.

### `onlyOwner()`



Throws if called by any account other than the owner.


### `constructor()` (internal)



Initializes the contract setting the deployer as the initial owner.

### `setController(address newOwner)` (external)

Transfers ownership of the contract to a new account (`newOwner`).
        Can only be called by the current owner


external for gas optimization


### `getController() → address` (external)

Returns the address of the current owner


external for gas optimization



### `OwnershipTransferred(address previousOwner, address newOwner)`





