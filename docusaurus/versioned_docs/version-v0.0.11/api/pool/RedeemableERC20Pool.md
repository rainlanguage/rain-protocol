The Balancer functionality is wrapped by the
`RedeemableERC20Pool` contract.

Balancer pools require significant configuration so this contract helps
decouple the implementation from the `Trust`.

It also ensures the pool tokens created during the initialization of the
Balancer LBP are owned by the `RedeemableERC20Pool` and never touch either
the `Trust` nor an externally owned account (EOA).

`RedeemableERC20Pool` has several phases:

- `Phase.ZERO`: Deployed not trading but can be by owner calling
`ownerStartDutchAuction`
- `Phase.ONE`: Trading open
- `Phase.TWO`: Trading open but can be closed by owner calling
`ownerEndDutchAuction`
- `Phase.THREE`: Trading closed



## Details
Deployer and controller for a Balancer ConfigurableRightsPool.
This contract is intended in turn to be owned by a `Trust`.

Responsibilities of `RedeemableERC20Pool`:
- Configure and deploy Balancer contracts with correct weights, rights and
  balances
- Allowing the owner to start and end a dutch auction raise modelled as
  Balancer's "gradual weights" functionality
- Tracking and enforcing 3 phases: unstarted, started, ended
- Burning unsold tokens after the raise and forwarding all raised and
  initial reserve back to the owner

Responsibilities of the owner:
- Providing all token and reserve balances
- Calling start and end raise functions
- Handling the reserve proceeds of the raise

## Variables
### `uint256` `MIN_BALANCER_POOL_BALANCE`

### `uint256` `MIN_RESERVE_INIT`

### `contract RedeemableERC20` `token`

### `uint256` `minimumTradingDuration`

### `contract IERC20` `reserve`

### `uint256` `reserveInit`

### `contract IConfigurableRightsPool` `crp`

### `uint256` `finalWeight`

### `uint256` `finalValuation`




## Functions
### `constructor(struct RedeemableERC20PoolConfig config_)` (public)





### `startDutchAuction()` (external)

Allow anyone to start the Balancer style dutch auction.
The auction won't start unless this contract owns enough of both the
tokens for the pool, so it is safe for anon to call.
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
`Phase.TWO` is scheduled by `startDutchAuction`.
Removes all LP tokens from the Balancer pool.
Burns all unsold redeemable tokens.
Forwards the reserve balance to the owner.



### `_beforeScheduleNextPhase(uint32 nextPhaseBlock_)` (internal)

Enforce `Phase.THREE` as the last phase.




