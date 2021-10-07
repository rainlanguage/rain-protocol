The `TrustFactory` contract is the only contract that the
deployer uses to deploy all contracts for a single project
fundraising event. It takes references to
`RedeemableERC20Factory`, `RedeemableERC20PoolFactory` and
`SeedERC20Factory` contracts, and builds a new `Trust` contract.


## Details
Factory for creating and registering new Trust contracts.

## Variables
### `contract RedeemableERC20Factory` `redeemableERC20Factory`

### `contract RedeemableERC20PoolFactory` `redeemableERC20PoolFactory`

### `contract SeedERC20Factory` `seedERC20Factory`




## Functions
### `constructor(struct TrustFactoryConfig config_)` (public)





### `createChild(struct TrustFactoryTrustConfig trustFactoryTrustConfig_, struct TrustFactoryTrustRedeemableERC20Config trustFactoryTrustRedeemableERC20Config_, struct TrustFactoryTrustRedeemableERC20PoolConfig trustFactoryTrustRedeemableERC20PoolConfig_) → address` (external)

Allows calling `createChild` with TrustConfig,
TrustRedeemableERC20Config and
TrustRedeemableERC20PoolConfig parameters.
Can use original Factory `createChild` function signature if function
parameters are already encoded.





### `_createChild(bytes data_) → address` (internal)

Implements `IFactory`.

`_createChild` hook must be overridden to actually create child
contract.

Implementers may want to overload this function with a typed equivalent
to expose domain specific structs etc. to the compiled ABI consumed by
tooling and other scripts. To minimise gas costs for deployment it is
expected that the tooling will consume the typed ABI, then encode the
arguments and pass them to this function directly.





