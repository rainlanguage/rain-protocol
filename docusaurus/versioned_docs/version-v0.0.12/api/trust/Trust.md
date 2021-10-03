Coordinates the mediation and distribution of tokens
between stakeholders.

The `Trust` contract is responsible for configuring the
`RedeemableERC20` token, `RedeemableERC20Pool` Balancer wrapper
and the `SeedERC20` contract.

Internally the `TrustFactory` calls several admin/owner only
functions on its children and these may impose additional
restrictions such as `Phased` limits.

The `Trust` builds and references `RedeemableERC20`,
`RedeemableERC20Pool` and `SeedERC20` contracts internally and
manages all access-control functionality.

The major functions of the `Trust` contract, apart from building
and configuring the other contracts, is to start and end the
fundraising event, and mediate the distribution of funds to the
correct stakeholders:

- On `Trust` construction, all minted `RedeemableERC20` tokens
  are sent to the `RedeemableERC20Pool`
- `anonStartDistribution` can be called by anyone to begin the
  Dutch Auction. This will revert if this is called before seeder reserve
  funds are available on the `Trust`.
- `anonEndDistribution` can be called by anyone (only when
  `RedeemableERC20Pool` is in `Phase.TWO`) to end the Dutch Auction
  and distribute funds to the correct stakeholders, depending on
  whether or not the auction met the fundraising target.
  - On successful raise
    - seed funds are returned to `seeder` address along with
      additional `seederFee` if configured
    - `redeemInit` is sent to the `redeemableERC20` address, to back
      redemptions
    - the `creator` gets the remaining balance, which should
      equal or exceed `minimumCreatorRaise`
  - On failed raise
    - seed funds are returned to `seeder` address
    - the remaining balance is sent to the `redeemableERC20` address, to
      back redemptions
    - the `creator` gets nothing


## Details
Mediates stakeholders and creates internal Balancer pools and tokens
for a distribution.

The goals of a distribution:
- Mint and distribute a `RedeemableERC20` as fairly as possible,
  prioritising true fans of a creator.
- Raise a minimum reserve so that a creator can deliver value to fans.
- Provide a safe space through membership style filters to enhance
  exclusivity for fans.
- Ensure that anyone who seeds the raise (not fans) by risking and
  providing capital is compensated.

Stakeholders:
- Creator: Have a project of interest to their fans
- Fans: Will purchase project-specific tokens to receive future rewards
  from the creator
- Seeder(s): Provide initial reserve assets to seed a Balancer trading pool
- Deployer: Configures and deploys the `Trust` contract

The creator is nominated to receive reserve assets on a successful
distribution. The creator must complete the project and fans receive
rewards. There is no on-chain mechanism to hold the creator accountable to
the project completion. Requires a high degree of trust between creator and
their fans.

Fans are willing to trust and provide funds to a creator to complete a
project. Fans likely expect some kind of reward or "perks" from the
creator, such as NFTs, exclusive events, etc.
The distributed tokens are untransferable after trading ends and merely act
as records for who should receive rewards.

Seeders add the initial reserve asset to the Balancer pool to start the
automated market maker (AMM).
Ideally this would not be needed at all.
Future versions of `Trust` may include a bespoke distribution mechanism
rather than Balancer contracts. Currently it is required by Balancer so the
seeder provides some reserve and receives a fee on successful distribution.
If the distribution fails the seeder is returned their initial reserve
assets. The seeder is expected to promote and mentor the creator in
non-financial ways.

The deployer has no specific priviledge or admin access once the `Trust` is
deployed. They provide the configuration, including nominating
creator/seeder, and pay gas but that is all.
The deployer defines the conditions under which the distribution is
successful. The seeder/creator could also act as the deployer.

Importantly the `Trust` contract is the owner/admin of the contracts it
creates. The `Trust` never transfers ownership so it directly controls all
internal workflows. No stakeholder, even the deployer or creator, can act
as owner of the internals.

## Variables
### `address` `creator`

### `uint256` `minimumCreatorRaise`

### `address` `seeder`

### `uint256` `seederFee`

### `uint16` `seederUnits`

### `uint16` `seederCooldownDuration`

### `uint256` `redeemInit`

### `contract SeedERC20Factory` `seedERC20Factory`

### `uint256` `finalBalance`

### `uint256` `successBalance`

### `contract RedeemableERC20` `token`

### `contract RedeemableERC20Pool` `pool`




## Functions
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



### `anonEndDistribution()` (external)

Anyone can end the distribution.
The requirement is that the `minimumTradingDuration` has elapsed.
If the `successBalance` is reached then the creator receives the raise
and seeder earns a fee.
Else the initial reserve is refunded to the seeder and sale proceeds
rolled forward to token holders (not the creator).



