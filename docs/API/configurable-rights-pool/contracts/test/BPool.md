## `BPool`





### `_logs_()`





### `_lock_()`





### `_viewlock_()`






### `isPublicSwap() → bool` (external)





### `isFinalized() → bool` (external)





### `isBound(address t) → bool` (external)





### `getNumTokens() → uint256` (external)





### `getCurrentTokens() → address[] tokens` (external)





### `getFinalTokens() → address[] tokens` (external)





### `getDenormalizedWeight(address token) → uint256` (external)





### `getTotalDenormalizedWeight() → uint256` (external)





### `getNormalizedWeight(address token) → uint256` (external)





### `getBalance(address token) → uint256` (external)





### `getSwapFee() → uint256` (external)





### `getController() → address` (external)





### `setSwapFee(uint256 swapFee)` (external)





### `setController(address manager)` (external)





### `setPublicSwap(bool public_)` (external)





### `finalize()` (external)





### `bind(address token, uint256 balance, uint256 denorm)` (external)





### `rebind(address token, uint256 balance, uint256 denorm)` (public)





### `unbind(address token)` (external)





### `gulp(address token)` (external)





### `getSpotPrice(address tokenIn, address tokenOut) → uint256 spotPrice` (external)





### `getSpotPriceSansFee(address tokenIn, address tokenOut) → uint256 spotPrice` (external)





### `joinPool(uint256 poolAmountOut, uint256[] maxAmountsIn)` (external)





### `exitPool(uint256 poolAmountIn, uint256[] minAmountsOut)` (external)





### `swapExactAmountIn(address tokenIn, uint256 tokenAmountIn, address tokenOut, uint256 minAmountOut, uint256 maxPrice) → uint256 tokenAmountOut, uint256 spotPriceAfter` (external)





### `swapExactAmountOut(address tokenIn, uint256 maxAmountIn, address tokenOut, uint256 tokenAmountOut, uint256 maxPrice) → uint256 tokenAmountIn, uint256 spotPriceAfter` (external)





### `joinswapExternAmountIn(address tokenIn, uint256 tokenAmountIn, uint256 minPoolAmountOut) → uint256 poolAmountOut` (external)





### `joinswapPoolAmountOut(address tokenIn, uint256 poolAmountOut, uint256 maxAmountIn) → uint256 tokenAmountIn` (external)





### `exitswapPoolAmountIn(address tokenOut, uint256 poolAmountIn, uint256 minAmountOut) → uint256 tokenAmountOut` (external)





### `exitswapExternAmountOut(address tokenOut, uint256 tokenAmountOut, uint256 maxPoolAmountIn) → uint256 poolAmountIn` (external)





### `_pullUnderlying(address erc20, address from, uint256 amount)` (internal)





### `_pushUnderlying(address erc20, address to, uint256 amount)` (internal)





### `_pullPoolShare(address from, uint256 amount)` (internal)





### `_pushPoolShare(address to, uint256 amount)` (internal)





### `_mintPoolShare(uint256 amount)` (internal)





### `_burnPoolShare(uint256 amount)` (internal)






### `LOG_SWAP(address caller, address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut)`





### `LOG_JOIN(address caller, address tokenIn, uint256 tokenAmountIn)`





### `LOG_EXIT(address caller, address tokenOut, uint256 tokenAmountOut)`





### `LOG_CALL(bytes4 sig, address caller, bytes data)`





