## `SeedERC20Factory`






### `_createChild(bytes data_) → address` (internal)

Decodes the arbitrary data_ parameter for SeedERC20 constructor,
which expects a SeedERC20Config type.





### `createChild(struct SeedERC20Config config_) → address` (external)

Allows calling `createChild` with SeedERC20Config struct.
Can use original Factory `createChild` function signature if function
parameters are already encoded.






