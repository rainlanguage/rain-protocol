## `ConfigurableRightsPool`

PCToken is the "Balancer Smart Pool" token (transferred upon finalization)


Rights are defined as follows (index values into the array)
     0: canPauseSwapping - can setPublicSwap back to false after turning it on
                           by default, it is off on initialization and can only be turned on
     1: canChangeSwapFee - can setSwapFee after initialization (by default, it is fixed at create time)
     2: canChangeWeights - can bind new token weights (allowed by default in base pool)
     3: canAddRemoveTokens - can bind/unbind tokens (allowed by default in base pool)
     4: canWhitelistLPs - can restrict LPs to a whitelist
     5: canChangeCap - can change the BSP cap (max # of pool tokens)

Note that functions called on bPool and bFactory may look like internal calls,
  but since they are contracts accessed through an interface, they are really external.
To make this explicit, we could write "IBPool(address(bPool)).function()" everywhere,
  instead of "bPool.function()".

### `logs()`





### `needsBPool()`





### `lockUnderlyingPool()`






### `constructor(address factoryAddress, struct ConfigurableRightsPool.PoolParams poolParams, struct RightsManager.Rights rightsStruct)` (public)

Construct a new Configurable Rights Pool (wrapper around BPool)


_initialTokens and _swapFee are only used for temporary storage between construction
     and create pool, and should not be used thereafter! _initialTokens is destroyed in
     createPool to prevent this, and _swapFee is kept in sync (defensively), but
     should never be used except in this constructor and createPool()


### `setSwapFee(uint256 swapFee)` (external)

Set the swap fee on the underlying pool


Keep the local version and core in sync (see below)
     bPool is a contract interface; function calls on it are external


### `isPublicSwap() → bool` (external)

Getter for the publicSwap field on the underlying pool


viewLock, because setPublicSwap is lock
     bPool is a contract interface; function calls on it are external


### `setCap(uint256 newCap)` (external)

Set the cap (max # of pool tokens)


_bspCap defaults in the constructor to unlimited
     Can set to 0 (or anywhere below the current supply), to halt new investment
     Prevent setting it before creating a pool, since createPool sets to intialSupply
     (it does this to avoid an unlimited cap window between construction and createPool)
     Therefore setting it before then has no effect, so should not be allowed


### `setPublicSwap(bool publicSwap)` (external)

Set the public swap flag on the underlying pool


If this smart pool has canPauseSwapping enabled, we can turn publicSwap off if it's already on
     Note that if they turn swapping off - but then finalize the pool - finalizing will turn the
     swapping back on. They're not supposed to finalize the underlying pool... would defeat the
     smart pool functions. (Only the owner can finalize the pool - which is this contract -
     so there is no risk from outside.)

     bPool is a contract interface; function calls on it are external


### `createPool(uint256 initialSupply, uint256 minimumWeightChangeBlockPeriodParam, uint256 addTokenTimeLockInBlocksParam)` (external)

Create a new Smart Pool - and set the block period time parameters


Initialize the swap fee to the value provided in the CRP constructor
     Can be changed if the canChangeSwapFee permission is enabled
     Time parameters will be fixed at these values

     If this contract doesn't have canChangeWeights permission - or you want to use the default
     values, the block time arguments are not needed, and you can just call the single-argument
     createPool()


### `createPool(uint256 initialSupply)` (external)

Create a new Smart Pool


Delegates to internal function


### `updateWeight(address token, uint256 newWeight)` (external)

Update the weight of an existing token


Notice Balance is not an input (like with rebind on BPool) since we will require prices not to change
     This is achieved by forcing balances to change proportionally to weights, so that prices don't change
     If prices could be changed, this would allow the controller to drain the pool by arbing price changes


### `updateWeightsGradually(uint256[] newWeights, uint256 startBlock, uint256 endBlock)` (external)

Update weights in a predetermined way, between startBlock and endBlock,
        through external calls to pokeWeights


Must call pokeWeights at least once past the end for it to do the final update
     and enable calling this again.
     It is possible to call updateWeightsGradually during an update in some use cases
     For instance, setting newWeights to currentWeights to stop the update where it is


### `pokeWeights()` (external)

External function called to make the contract update weights according to plan


Still works if we poke after the end of the period; also works if the weights don't change
     Resets if we are poking beyond the end, so that we can do it again

### `commitAddToken(address token, uint256 balance, uint256 denormalizedWeight)` (external)

Schedule (commit) a token to be added; must call applyAddToken after a fixed
        number of blocks to actually add the token



The purpose of this two-stage commit is to give warning of a potentially dangerous
     operation. A malicious pool operator could add a large amount of a low-value token,
     then drain the pool through price manipulation. Of course, there are many
     legitimate purposes, such as adding additional collateral tokens.



### `applyAddToken()` (external)

Add the token previously committed (in commitAddToken) to the pool



### `removeToken(address token)` (external)

Remove a token from the pool


bPool is a contract interface; function calls on it are external


### `joinPool(uint256 poolAmountOut, uint256[] maxAmountsIn)` (external)

Join a pool


Emits a LogJoin event (for each token)
     bPool is a contract interface; function calls on it are external


### `exitPool(uint256 poolAmountIn, uint256[] minAmountsOut)` (external)

Exit a pool - redeem pool tokens for underlying assets


Emits a LogExit event for each token
     bPool is a contract interface; function calls on it are external


### `joinswapExternAmountIn(address tokenIn, uint256 tokenAmountIn, uint256 minPoolAmountOut) → uint256 poolAmountOut` (external)

Join by swapping a fixed amount of an external token in (must be present in the pool)
        System calculates the pool token amount


emits a LogJoin event


### `joinswapPoolAmountOut(address tokenIn, uint256 poolAmountOut, uint256 maxAmountIn) → uint256 tokenAmountIn` (external)

Join by swapping an external token in (must be present in the pool)
        To receive an exact amount of pool tokens out. System calculates the deposit amount


emits a LogJoin event


### `exitswapPoolAmountIn(address tokenOut, uint256 poolAmountIn, uint256 minAmountOut) → uint256 tokenAmountOut` (external)

Exit a pool - redeem a specific number of pool tokens for an underlying asset
        Asset must be present in the pool, and will incur an EXIT_FEE (if set to non-zero)


Emits a LogExit event for the token


### `exitswapExternAmountOut(address tokenOut, uint256 tokenAmountOut, uint256 maxPoolAmountIn) → uint256 poolAmountIn` (external)

Exit a pool - redeem pool tokens for a specific amount of underlying assets
        Asset must be present in the pool


Emits a LogExit event for the token


### `whitelistLiquidityProvider(address provider)` (external)

Add to the whitelist of liquidity providers (if enabled)




### `removeWhitelistedLiquidityProvider(address provider)` (external)

Remove from the whitelist of liquidity providers (if enabled)




### `canProvideLiquidity(address provider) → bool` (external)

Check if an address is a liquidity provider


If the whitelist feature is not enabled, anyone can provide liquidity (assuming finalized)


### `hasPermission(enum RightsManager.Permissions permission) → bool` (external)

Getter for specific permissions


value of the enum is just the 0-based index in the enumeration
     For instance canPauseSwapping is 0; canChangeWeights is 2


### `getDenormalizedWeight(address token) → uint256` (external)

Get the denormalized weight of a token


viewlock to prevent calling if it's being updated


### `getRightsManagerVersion() → address` (external)

Getter for the RightsManager contract


Convenience function to get the address of the RightsManager library (so clients can check version)


### `getBalancerSafeMathVersion() → address` (external)

Getter for the BalancerSafeMath contract


Convenience function to get the address of the BalancerSafeMath library (so clients can check version)


### `getSmartPoolManagerVersion() → address` (external)

Getter for the SmartPoolManager contract


Convenience function to get the address of the SmartPoolManager library (so clients can check version)


### `mintPoolShareFromLib(uint256 amount)` (public)





### `pushPoolShareFromLib(address to, uint256 amount)` (public)





### `pullPoolShareFromLib(address from, uint256 amount)` (public)





### `burnPoolShareFromLib(uint256 amount)` (public)





### `createPoolInternal(uint256 initialSupply)` (internal)

Create a new Smart Pool


Initialize the swap fee to the value provided in the CRP constructor
     Can be changed if the canChangeSwapFee permission is enabled


### `_pullUnderlying(address erc20, address from, uint256 amount)` (internal)





### `_pushUnderlying(address erc20, address to, uint256 amount)` (internal)





### `_mint(uint256 amount)` (internal)





### `_mintPoolShare(uint256 amount)` (internal)





### `_pushPoolShare(address to, uint256 amount)` (internal)





### `_pullPoolShare(address from, uint256 amount)` (internal)





### `_burnPoolShare(uint256 amount)` (internal)






### `LogCall(bytes4 sig, address caller, bytes data)`





### `LogJoin(address caller, address tokenIn, uint256 tokenAmountIn)`





### `LogExit(address caller, address tokenOut, uint256 tokenAmountOut)`





### `CapChanged(address caller, uint256 oldCap, uint256 newCap)`





### `NewTokenCommitted(address token, address pool, address caller)`





