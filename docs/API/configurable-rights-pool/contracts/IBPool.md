## `IBPool`






### `rebind(address token, uint256 balance, uint256 denorm)` (external)





### `setSwapFee(uint256 swapFee)` (external)





### `setPublicSwap(bool publicSwap)` (external)





### `bind(address token, uint256 balance, uint256 denorm)` (external)





### `unbind(address token)` (external)





### `gulp(address token)` (external)





### `isBound(address token) → bool` (external)





### `getBalance(address token) → uint256` (external)





### `totalSupply() → uint256` (external)





### `getSwapFee() → uint256` (external)





### `isPublicSwap() → bool` (external)





### `getDenormalizedWeight(address token) → uint256` (external)





### `getTotalDenormalizedWeight() → uint256` (external)





### `EXIT_FEE() → uint256` (external)





### `calcPoolOutGivenSingleIn(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 poolSupply, uint256 totalWeight, uint256 tokenAmountIn, uint256 swapFee) → uint256 poolAmountOut` (external)





### `calcSingleInGivenPoolOut(uint256 tokenBalanceIn, uint256 tokenWeightIn, uint256 poolSupply, uint256 totalWeight, uint256 poolAmountOut, uint256 swapFee) → uint256 tokenAmountIn` (external)





### `calcSingleOutGivenPoolIn(uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 poolSupply, uint256 totalWeight, uint256 poolAmountIn, uint256 swapFee) → uint256 tokenAmountOut` (external)





### `calcPoolInGivenSingleOut(uint256 tokenBalanceOut, uint256 tokenWeightOut, uint256 poolSupply, uint256 totalWeight, uint256 tokenAmountOut, uint256 swapFee) → uint256 poolAmountIn` (external)





### `getCurrentTokens() → address[] tokens` (external)






