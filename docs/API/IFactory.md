## `IFactory`






### `createChild(bytes data_) → address` (external)

Creates a new child contract.





### `isChild(address maybeChild_) → bool` (external)

Checks if address is registered as a child contract of this factory.






### `NewContract(address _contract)`

Whenever a new child contract is deployed, a `NewContract`
event containing the new child contract address is emitted.



