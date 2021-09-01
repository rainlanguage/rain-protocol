## `Factory`






### `_createChild(bytes data_) → address` (internal)

Implements `IFactory`.

`_createChild` hook must be overridden to actually create child
contract.





### `createChild(bytes data_) → address` (external)

Implements `IFactory`.

Calls the _createChild hook, which inheriting contracts must override.
Registers child contract address to `contracts` mapping.
Emits `NewContract` event.





### `isChild(address maybeChild_) → bool` (external)

Implements `IFactory`.

Checks if address is registered as a child contract of this factory.






