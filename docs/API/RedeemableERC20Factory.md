## `RedeemableERC20Factory`






### `_createChild(bytes data_) → address` (internal)

Decodes the arbitrary data_ parameter for RedeemableERC20 constructor,
which expects a RedeemableERC20Config type.





### `createChild(struct RedeemableERC20Config config_) → address` (external)

Allows calling `createChild` with RedeemableERC20Config struct.
Can use original Factory `createChild` function signature if function
parameters are already encoded.






