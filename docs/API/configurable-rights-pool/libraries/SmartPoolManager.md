## `SmartPoolManager`






### `updateWeight(contract IConfigurableRightsPool self, contract IBPool bPool, address token, uint256 newWeight)` (external)

Update the weight of an existing token


Refactored to library to make CRPFactory deployable


### `pokeWeights(contract IBPool bPool, struct SmartPoolManager.GradualUpdateParams gradualUpdate)` (external)

External function called to make the contract update weights according to plan




### `commitAddToken(contract IBPool bPool, address token, uint256 balance, uint256 denormalizedWeight, struct SmartPoolManager.NewTokenParams newToken)` (external)

Schedule (commit) a token to be added; must call applyAddToken after a fixed
        number of blocks to actually add the token




### `applyAddToken(contract IConfigurableRightsPool self, contract IBPool bPool, uint256 addTokenTimeLockInBlocks, struct SmartPoolManager.NewTokenParams newToken)` (external)

Add the token previously committed (in commitAddToken) to the pool




### `removeToken(contract IConfigurableRightsPool self, contract IBPool bPool, address token)` (external)

Remove a token from the pool


Logic in the CRP controls when ths can be called. There are two related permissions:
     AddRemoveTokens - which allows removing down to the underlying BPool limit of two
     RemoveAllTokens - which allows completely draining the pool by removing all tokens
                       This can result in a non-viable pool with 0 or 1 tokens (by design),
                       meaning all swapping or binding operations would fail in this state


### `verifyTokenCompliance(address token)` (external)

Non ERC20-conforming tokens are problematic; don't allow them in pools


Will revert if invalid


### `verifyTokenCompliance(address[] tokens)` (external)

Non ERC20-conforming tokens are problematic; don't allow them in pools


Will revert if invalid - overloaded to save space in the main contract


### `updateWeightsGradually(contract IBPool bPool, struct SmartPoolManager.GradualUpdateParams gradualUpdate, uint256[] newWeights, uint256 startBlock, uint256 endBlock, uint256 minimumWeightChangeBlockPeriod)` (external)

Update weights in a predetermined way, between startBlock and endBlock,
        through external cals to pokeWeights




### `joinPool(contract IConfigurableRightsPool self, contract IBPool bPool, uint256 poolAmountOut, uint256[] maxAmountsIn) → uint256[] actualAmountsIn` (external)

Join a pool




### `exitPool(contract IConfigurableRightsPool self, contract IBPool bPool, uint256 poolAmountIn, uint256[] minAmountsOut) → uint256 exitFee, uint256 pAiAfterExitFee, uint256[] actualAmountsOut` (external)

Exit a pool - redeem pool tokens for underlying assets




### `joinswapExternAmountIn(contract IConfigurableRightsPool self, contract IBPool bPool, address tokenIn, uint256 tokenAmountIn, uint256 minPoolAmountOut) → uint256 poolAmountOut` (external)

Join by swapping a fixed amount of an external token in (must be present in the pool)
        System calculates the pool token amount




### `joinswapPoolAmountOut(contract IConfigurableRightsPool self, contract IBPool bPool, address tokenIn, uint256 poolAmountOut, uint256 maxAmountIn) → uint256 tokenAmountIn` (external)

Join by swapping an external token in (must be present in the pool)
        To receive an exact amount of pool tokens out. System calculates the deposit amount




### `exitswapPoolAmountIn(contract IConfigurableRightsPool self, contract IBPool bPool, address tokenOut, uint256 poolAmountIn, uint256 minAmountOut) → uint256 exitFee, uint256 tokenAmountOut` (external)

Exit a pool - redeem a specific number of pool tokens for an underlying asset
        Asset must be present in the pool, and will incur an EXIT_FEE (if set to non-zero)




### `exitswapExternAmountOut(contract IConfigurableRightsPool self, contract IBPool bPool, address tokenOut, uint256 tokenAmountOut, uint256 maxPoolAmountIn) → uint256 exitFee, uint256 poolAmountIn` (external)

Exit a pool - redeem pool tokens for a specific amount of underlying assets
        Asset must be present in the pool




### `verifyTokenComplianceInternal(address token)` (internal)






