## `RedeemableERC20Pool`






### `constructor(struct RedeemableERC20PoolConfig config_)` (public)





### `ownerStartDutchAuction(uint256 finalAuctionBlock_)` (external)

Allow the owner to start the Balancer style dutch auction.
`Phase.ZERO` indicates the auction can start.
`Phase.ONE` indicates the auction has started.
`Phase.TWO` indicates the auction can be ended.
`Phase.THREE` indicates the auction has ended.
Creates the pool via. the CRP contract and configures the weight change
curve.




### `ownerEndDutchAuction()` (external)

Allow the owner to end the Balancer style dutch auction.
Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has
ended.
`Phase.TWO` is scheduled by `ownerStartDutchAuction`.
Removes all LP tokens from the balancer pool.
Burns all unsold redeemable tokens.
Forwards the reserve balance to the owner.



### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Enforce Phase.THREE as the last phase.





