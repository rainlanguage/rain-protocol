## `CRPFactory`



Rights are held in a corresponding struct in ConfigurableRightsPool
     Index values are as follows:
     0: canPauseSwapping - can setPublicSwap back to false after turning it on
                           by default, it is off on initialization and can only be turned on
     1: canChangeSwapFee - can setSwapFee after initialization (by default, it is fixed at create time)
     2: canChangeWeights - can bind new token weights (allowed by default in base pool)
     3: canAddRemoveTokens - can bind/unbind tokens (allowed by default in base pool)
     4: canWhitelistLPs - if set, only whitelisted addresses can join pools
                          (enables private pools with more than one LP)
     5: canChangeCap - can change the BSP cap (max # of pool tokens)


### `newCrp(address factoryAddress, struct ConfigurableRightsPool.PoolParams poolParams, struct RightsManager.Rights rights) → contract ConfigurableRightsPool` (external)

Create a new CRP


emits a LogNewCRP event


### `isCrp(address addr) → bool` (external)

Check to see if a given address is a CRP





### `LogNewCrp(address caller, address pool)`





