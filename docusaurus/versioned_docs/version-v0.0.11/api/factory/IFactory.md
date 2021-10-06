



## Events
### `NewContract(address _contract)`

Whenever a new child contract is deployed, a `NewContract` event
containing the new child contract address MUST be emitted.





## Functions
### `createChild(bytes data_) → address` (external)

Creates a new child contract.





### `isChild(address maybeChild_) → bool` (external)

Checks if address is registered as a child contract of this factory.

Addresses that were not deployed by `createChild` MUST NOT return
`true` from `isChild`. This is CRITICAL to the security guarantees for
any contract implementing `IFactory`.





