## `ElasticSupplyPool`



  Extension of Balancer labs' configurable rights pool (smart-pool).
       Amples are a dynamic supply tokens, supply and individual balances change daily by a Rebase operation.
       In constant-function markets, Ampleforth's supply adjustments result in Impermanent Loss (IL)
       to liquidity providers. The AmplElasticCRP is an extension of Balancer Lab's
       ConfigurableRightsPool which mitigates IL induced by supply adjustments.

       It accomplishes this by doing the following mechanism:
       The `resyncWeight` method will be invoked atomically after rebase through Ampleforth's orchestrator.

       When rebase changes supply, ampl weight is updated to the geometric mean of
       the current ampl weight and the target. Every other token's weight is updated
       proportionally such that relative ratios are same.

       Weights: {w_ampl, w_t1 ... w_tn}

       Rebase_change: x% (Ample's supply changes by x%, can be positive or negative)

       Ample target weight: w_ampl_target = (100+x)/100 * w_ampl

       w_ampl_new = sqrt(w_ampl * w_ampl_target)  // geometric mean
       for i in tn:
          w_ti_new = (w_ampl_new * w_ti) / w_ampl_target



### `constructor(address factoryAddress, struct ConfigurableRightsPool.PoolParams poolParams, struct RightsManager.Rights rightsParams)` (public)

Construct a new Configurable Rights Pool (wrapper around BPool)




### `createPool(uint256, uint256, uint256)` (external)

ElasticSupply pools don't have updateWeightsGradually, so cannot call this
param initialSupply starting token balance
param minimumWeightChangeBlockPeriod - Enforce a minimum time between the start and end blocks
param addTokenTimeLockInBlocks - Enforce a mandatory wait time between updates
                                  This is also the wait time between committing and applying a new token



### `updateWeight(address, uint256)` (external)

Update the weight of an existing token - cannot do this in ElasticSupplyPools
param token - token to be reweighted
param newWeight - new weight of the token



### `updateWeightsGradually(uint256[], uint256, uint256)` (external)

Update weights in a predetermined way, between startBlock and endBlock,
        through external calls to pokeWeights -- cannot do this in ElasticSupplyPools


Makes sure we aren't already in a weight update scheme
     Must call pokeWeights at least once past the end for it to do the final update
     and enable calling this again. (Could make this check for that case, but unwarranted complexity.)
param newWeights - final weights we want to get to
param startBlock - when weights should start to change
param endBlock - when weights will be at their final values

### `pokeWeights()` (external)

External function called to make the contract update weights according to plan
        Unsupported in ElasticSupplyPools



### `resyncWeight(address token)` (external)

Update the weight of a token without changing the price (or transferring tokens)


Checks if the token's current pool balance has deviated from cached balance,
     if so it adjusts the token's weights proportional to the deviation.
     The underlying BPool enforces bounds on MIN_WEIGHTS=1e18, MAX_WEIGHT=50e18 and TOTAL_WEIGHT=50e18.
     NOTE: The BPool.rebind function CAN REVERT if the updated weights go beyond the enforced bounds.


### `LogCall(bytes4 sig, address caller, bytes data)`





### `LogJoin(address caller, address tokenIn, uint256 tokenAmountIn)`





### `LogExit(address caller, address tokenOut, uint256 tokenAmountOut)`





