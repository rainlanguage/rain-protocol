## `ReserveTokenTest`






### `addFreezable(address address_)` (external)

Anyone in the world can freeze any address on our test asset.




### `removeFreezable(address address_)` (external)

Anyone in the world can unfreeze any address on our test asset.




### `purge()` (external)

Burns all tokens held by the sender.



### `_beforeTokenTransfer(address, address receiver_, uint256)` (internal)

Enforces the freeze list.




