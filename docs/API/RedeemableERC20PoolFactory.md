## `RedeemableERC20PoolFactory`






### `constructor(struct RedeemableERC20PoolFactoryConfig config_)` (public)





### `_createChild(bytes data_) → address` (internal)

Decodes the arbitrary data_ parameter for RedeemableERC20Pool
constructor, which expects a RedeemableERC20PoolConfig type.





### `createChild(struct RedeemableERC20PoolFactoryRedeemableERC20PoolConfig config_) → address` (external)

Allows calling `createChild` with
RedeemableERC20PoolFactoryRedeemableERC20PoolConfig struct.
Can use original Factory `createChild` function signature if function
parameters are already encoded.






