## `TrustFactory`






### `constructor(struct TrustFactoryConfig config_)` (public)





### `createChild(struct TrustFactoryTrustConfig trustFactoryTrustConfig_, struct TrustFactoryTrustRedeemableERC20Config trustFactoryTrustRedeemableERC20Config_, struct TrustFactoryTrustRedeemableERC20PoolConfig trustFactoryTrustRedeemableERC20PoolConfig_) → address` (external)

Allows calling `createChild` with TrustConfig,
TrustRedeemableERC20Config and
TrustRedeemableERC20PoolConfig parameters.
Can use original Factory `createChild` function signature if function
parameters are already encoded.





### `_createChild(bytes data_) → address` (internal)

Decodes the arbitrary data_ parameter for Trust
constructor, which expects 3 parameters: TrustConfig,
TrustRedeemableERC20Config and TrustRedeemableERC20PoolConfig.






