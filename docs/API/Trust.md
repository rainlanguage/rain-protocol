## `Trust`






### `constructor(struct TrustConfig config_, struct TrustRedeemableERC20Config trustRedeemableERC20Config_, struct TrustRedeemableERC20PoolConfig trustRedeemableERC20PoolConfig_)` (public)

Sanity checks configuration.
Creates the `RedeemableERC20` contract and mints the redeemable ERC20
token.
Creates the `RedeemableERC20Pool` contract.
(optional) Creates the `SeedERC20` contract. Pass a non-zero address to
bypass this.
Adds the Balancer pool contracts to the token sender/receiver lists as
needed.
Adds the Balancer pool reserve asset as the first redeemable on the
`RedeemableERC20` contract.

Note on slither:
Slither detects a benign reentrancy in this constructor.
However reentrancy is not possible in a contract constructor.
Further discussion with the slither team:
https://github.com/crytic/slither/issues/887





### `getContracts() → struct TrustContracts` (external)

Accessor for the `TrustContracts` of this `Trust`.



### `getTrustConfig() → struct TrustConfig` (external)

Accessor for the `TrustConfig` of this `Trust`.



### `getDistributionProgress() → struct DistributionProgress` (external)

Accessor for the `DistributionProgress` of this `Trust`.



### `getDistributionStatus() → enum DistributionStatus` (public)

Accessor for the `DistributionStatus` of this `Trust`.



### `anonStartDistribution()` (external)

Anyone can start the distribution.
The requirement is that BOTH the reserve and redeemable tokens have
already been sent to the Balancer pool.
If the pool has the required funds it will set the weight curve and
start the dutch auction.



### `anonEndDistribution()` (external)

Anyone can end the distribution.
The requirement is that the `minimumTradingDuration` has elapsed.
If the `successBalance` is reached then the creator receives the raise
and seeder earns a fee.
Else the initial reserve is refunded to the seeder and sale proceeds
rolled forward to token holders (not the creator).




