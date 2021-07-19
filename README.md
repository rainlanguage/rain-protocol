# Trust x Balancer

A multi-phase `Trust` contract to facilitate creators distributing event and project tokens to fans.

Uses Balancer's [Liquidity Bootstrapping Pool](https://docs.balancer.finance/smart-contracts/smart-pools/liquidity-bootstrapping-faq) to distribute the tokens.

The goal is to achieve something analogous to KickStarter where specific projects and events are made possible through a one-time fundraising.

The basic process is:

- The trust and pools are established with a freshly minted project/event token and some starting capital for trading
- The liquidity bootstrapping pool is used to distribute the freshly minted tokens
- The pool is closed
     - Some of the raised funds are forwarded to the minted token contract
     - The creator receives the bulk of the raised funds
     - Some fees are distributed to other stakeholders
- Any undistributed tokens are burned and all distributed tokens are frozen
- The creator creates and distributes rewards over time in many ways:
     - Creating claimable NFTs and other perks that require claimants to hold a minimum balance of the distributed token
     - Sending erc20 tokens to the distributed token contract that require claimants to burn their tokens to redeem
     - Hosting real world exclusive events etc. that require claimants to hold a minimum balance of the distributed token to participate

The process requires a high degree of trust between the creator and their fans as there is no on-chain mechanism to enforce delivery of any perks.

The token minting, distribution, burning is all trustless as the deployed `Trust` contract handles construction and ownership of the other contracts.

As each `Trust` is dedicated to a specific project or event there are no admin or upgrade functions. Future versions of `Trust` will simply be picked up by new projects and events as they arise.

The `Trust` has native integration with the `Prestige` membership system included as a git submodule. Any account that does not have a minimum membership status cannot receive the distributed token and so cannot participate. This allows additional requirements to be placed on the participants by the deployer of the trust.

Any legal or regulatory requirements such as KYC/AML or securities law are the responsibility of the stakeholders.

The stakeholders are:

- The deployer of the `Trust` contract who provides all the initial configuration parameters and pays the gas for deployment
- The creator who is raising money to create some new value in the world
- The token holders who trade tokens during the distribution phase on the Balancer pool and then hold frozen tokens after the distribution finishes
- The seeder who provides the initial tokens on the other side of the Balancer trading pool to bootstrap trading

Without offering legal advice, one hypothetical way this could look (something like KickStarter):

- The creator and deployer of the `Trust` creates a `Prestige` contract that allows only close friends and family to hold a membership status
- The creator, who is a crypto-enthusiast and musician, decides to hold an intimate "fans only" event, using signatures from the accounts holding a frozen token balance as tickets to her event

As the creator knows all her fans, and the token balances are frozen (cannot be traded on a secondary market), and the reward for holding the tokens is a one-time in person event, it's unlikely to be considered a public sale of an investment contract (for example) or cause KYC issues.

Another situation could be (along the lines of Kiva):

- The creator of the `Trust` lives in a remote village in a poor country and needs a new roof for her house
- She creates a small social media campaign for her own and surrounding villages to raise the money she needs, and airdrops a cute NFT to everyone who helped

As none of the participants in the system are American, the SEC has no jurisdiction, and the raised money is being used directly to fix a private individual's home so it is not an investment. The NFT has only sentimental value as a "thank you" note between neighbours.

Of course, the same system could be used to facilitate something that is probably regulated by the SEC:

- An American creator and deployer of the `Trust` actively promotes sale of the minted tokens to a global audience
- The creator uses the raised capital to purchase real estate and regularly airdrops the rent received to all token holders

In this case it is hard to see how the fundraise is not simply a public sale of an investment contract, by an American, for Americans, but with weird extra steps by using `Trust`. The creator, as an American, would need to ensure (presumably offchain somehow) that they are meeting their local regulatory requirements.

The nature of data in a public blockchain is no different to a public Google spreadsheet. That is to say, it has no knowledge of or control over what the numbers and balances it calculates represent in the real world. This can only be made visible and accountable through curation by humans. The `Trust` contract is simply tracking the flow of existing tokens towards the creator and newly minted tokens distributed away from the creator, then frozen so the creator can reference them later.

Our goal is to build a free and open source system that makes it as easy and affordable as possible for creators to deploy `Trust` contracts that are secure and can meet local laws and regulations, without positioning ourselves as the gatekeeper of every possible use-case.

The current roadmap towards this goal:

- [x] Create the basic contracts needed to facilitate each phase
- [ ] Audit and open source everything in a combined public repository
- [ ] Create factory contracts that register deployed contracts and allow for automatic verification of the authenticity of a `Trust`
- [ ] Create SDKs and incentives to foster global permissionless CURATION of raises across many independent GUIs, platforms and blockchains
- [ ] Facilitate Token Lists and Kleros style layers of additional CURATION to protect users and platforms from illicit activities
- [ ] More KYC/AML tools for creators
- [ ] More distribution mechanisms
- [ ] Data analytics and tools for better CURATION

## Development setup

### Git submodules

As we are wrapping balancer contracts, we have git submodules pointing to their repositories.

When you clone this repository make sure to use `--recurse-submodules`

```
git clone --recurse-submodules git@github.com:thedavidmeister/tv-balancer.git
```

### Nix Shell

Install the nix shell if you haven't already.

```
curl -L https://nixos.org/nix/install | sh
```

Drop into a nix-shell.

```
cd tv-balancer
nix-shell
```

### Run tests

From _outside_ the nix-shell run:

```
nix-shell --run 'hardhat test'
```

Inside the nix-shell you can just run `hardhat test` as normal.

### Run security check

Inside the nix-shell run `security-check`.

__IMPORTANT: `security-check` applies and removes several patches to balancer to get slither compiling__

If you cancel the security check before it is finished your repository may be left in a dirty state.

## Definitions

### Seeder

A contract or address that sends reserve token to the `Trust` before distribution starts to bootstrap the ability to trade.

After the distribution completes the seeder is refunded their reserve tokens plus an optional seeder fee.

### Reserve token

The token that exists before the distribution starts and is provided by the seeder to be the other side of the pair in the Balancer pool.

This token is expected to be valuable and liquid so that the creator can fund their creation process with it.

### Redeemable token

The token that is minted by the `Trust` and distributed by trading during the distribution phase.

The redeemable token is frozen (impossible to transfer) after the distribution phase ends.

The redeemable token can be burned for a pro-rata redemption of any erc20 tokens the redeemable token contract itself owns.

### Liquidity Bootstrapping Pool

The 'Liquidity Bootstrapping Pool' (LBP) is a style of AMM developed by Balancer.

It simulates a Dutch Auction through Balancer's spot price mechanism as a combination of weight and relative token amounts.

Empirical evidence from the [PERP token distribution](https://medium.com/balancer-protocol/a-new-paradigm-for-token-distribution-c82de13626bb) indicates this is a decent mechanism to achieve a wider and 'fairer' distribution of tokens than a simple AMM listing.

Fairness is hard to define objectively, but for our purposes we want to:

- Minimise scalping, i.e. users buying early with the intent to sell at a higher price to users who want the token utility
- Maximise the value unlocked by the distribution in terms of the reserve token
- Mimimise whales, i.e. users who buy a significant percentage of the total token supply with the intent to manipulate the price paid by users who want the token utility
- Allow for subjective valuation by users who want the token utility
- Protect the interests of users who want to hodl the token for its utility
- Avoid economic exploits that allow users to leverage mechanisms provided by other smart contracts to extract value from the pool for themselves (e.g. flash loan style attacks)
- Allow for efficient price discovery
- Mitigate 'front running' where a user (bot) sends orders in advance of (with higher gas than) another trade when it is visible in the mempool but not yet included in a block, in order to force the other user to pay a higher spot price and then immediately dump on this (almost) guaranteed higher price

The [Balancer Whitepaper](https://balancer.finance/whitepaper/) outlines the formulas and proofs (relevant extracts in the comments in this codebase) used to define spot price in terms of amount and weight of each token in the pool.

The target/final weights of the distribution phase give a spot price equal to the book value of the token _assuming no trades_.
This means the maximum possible dump of the pool at the lowest possible weight (i.e. 100% of all tokens are dumped) is equal to the configured final valuation.

The [Balancer documentation](https://docs.balancer.finance/) is the best reference for more details on how this works.

## Contracts

### Cooldown

`Cooldown` is an abstract contract that rate limits functions on the contract per `msg.sender`.

Each time a function with the `onlyAfterCooldown` modifier is called the `msg.sender` must wait X blocks before calling any modified function.

This does nothing to prevent sybils who can generate an arbitrary number of `msg.sender` values in parallel to spam a contract.

`Cooldown` is intended to prevent rapid state cycling to grief a contract, such as rapidly locking and unlocking a large amount of capital in the `SeedERC20` contract.

Attaching significant economic stake to state changes with a long cooldown may help to mitigate sybils by forcing an opportunity cost on participants.

### Phased

`Phased` is an abstract contract that defines up to `9` phases that an implementing contract moves through.

`Phase.ZERO` is always the first phase and does not need to be set expicitly.

Each subsequent phase `Phase.ONE` through `Phase.EIGHT` must be scheduled sequentially.

Only the immediate next phase can be scheduled with `scheduleNextPhase`, it is not possible to schedule multiple phases.

Multiple phases can be scheduled in a single block if each scheduled phase is scheduled for the current block.

Several utility functions and modifiers are provided.

A single hook `_beforeScheduleNextPhase` is provided so contracts can implement additional phase shift checks.

One event `PhaseShiftScheduled` is emitted each time a phase shift is scheduled.

### RedeemableERC20

This is the ERC20 token that is minted and distributed.

During `Phase.ZERO` the token can be traded and so compatible with the Balancer pool mechanics.

During `Phase.ONE` the token is frozen and no longer able to be traded on any AMM or directly.

The token can be redeemed during `Phase.ONE` which burns the token in exchange for pro-rata erc20 tokens held by the `RedeemableERC20` contract itself.

The token balances can be used indirectly for other claims, promotions and events as a proof of participation in the original distribution by token holders.

The token can optionally be restricted by the `Prestige` contract to only allow receipients with a specified membership status.

### RedeemableERC20Pool

The Balancer functionality is wrapped by the `RedeemableERC20Pool` contract.

Balancer pools require significant configuration so this contract helps decouple the implementation from the `Trust`.

It also ensures the pool tokens created during the initialization of the Balancer LBP are owned by the `RedeemableERC20Pool` and never touch either the `Trust` nor an externally owned account (EOA).

`RedeemableERC20Pool` has several phases:

- `Phase.ZERO`: Deployed not trading but can be by owner calling `ownerStartDutchAuction`
- `Phase.ONE`: Trading open
- `Phase.TWO`: Trading open but can be closed by owner calling `ownerEndDutchAuction`
- `Phase.THREE`: Trading closed

### SeedERC20

Facilitates raising seed reserve from an open set of seeders.

When a single seeder address cannot be specified at the time the `Trust` is constructed a `SeedERC20` will be deployed.

The `SeedERC20` has two phases:

- `Phase.ZERO`: Can swap seed tokens for reserve assets with `seed` and `unseed`
- `Phase.ONE`: Can redeem seed tokens pro-rata for reserve assets

When the last seed token is distributed the `SeedERC20` immediately moves to `Phase.ONE` atomically within that transaction and forwards all reserve to the configured recipient.

For our use-case the recipient is a `Trust` contract but `SeedERC20` could be used as a mini-fundraise contract for many purposes. In the case that a recipient is not a `Trust` the recipient will need to be careful not to fall afoul of KYC and securities law.

## Trust

The `Trust` contract is the only contract that the deployer deploys directly. The `Trust` builds and references all other contracts internally and manages all access controlled functionally.

The only function that is not world-callable is the `creatorAddRedeemable` function that proxies `adminAddRedeemable` from the minted `RedeemableERC20` contract for the creator.

Internally the `Trust` calls several admin/owner only functions on its children and these may impose additional restrictions such as `Phased` limits.

## Risk mitigation

### Audits

Audits can be found in the `audits` folder.

### Gas optimisations

Hardhat is configured to leverage the solidity compiler optimizer and report on gas usage for all test runs.

In general clarity and reuse of existing standard functionality, such as Open Zeppelin RBAC access controls, is preferred over micro-optimisation of gas costs.

For many desirable use-cases, such as small independent artists or rural communities, the gas costs on ethereum mainnet will ALWAYS be unaffordable no matter how much we optimise these contracts.

The intent is to keep a reasonable balance between cost and clarity then deploy the contracts to L2 solutions such as Polygon where the baseline gas cost is several orders of magnitude cheaper.

### Unit tests

All functionality is unit tested. The tests are in the `test` folder.

If some functionality or potential exploit is missing a test this is a bug and so an issue and/or PR should be raised.

### Minimum raise threshold

The `Trust` contract has minimum redeem init, creator raise and seeder fee parameters (can both be zero).

The distribution is considered successful if the total reserve deposited in the Balancer pool during the distribution phase (in addition to the initial seed) covers all three.

In the case of a successful raise:

- The creator raise will be forwarded to the creator
- The seeder will receive their original seed plus the seed fee minus pool dust
- The redeem init will be forwarded to the `RedeemableERC20` contract (can be redeemed via. burns)

In the case of a failed raise:

- The creator gets nothing
- The seeder receives their original seed minus pool dust
- All remaining reserve assets are forwarded to the `RedeemableERC20` contract (can be redeemed via. burns)

Note that reserve assets forwarded to the `RedeemableERC20` contract are redeemed pro-rata in both cases. This means that in the case of a failed raise a token holder could redeem their tokens for more or less reserve than they swapped originally, as they will be redeeming for the _average_ swap value, not _their_ swap value.

This mechanism:

- Protects everyone in the case that the raised reserve is too low for the creator to do what they wanted
- Incentivises token purchases when the price is lower than average if a raise is close to failing, thus making it more likely to succeed

### Maximum raise

The creator starts the price of tokens high in their own estimation, with the price gradually declining over the distribution.

This protects the creator from over-raising and being unable to deliver.

For example, an indie painter can only produce a few thousand $ worth of value in a single painting, if they raise a million $ they aren't suddenly going to paint the Mona Lisa.

Raising too much can be just as problematic as raising too little, so we do our best to help creators raise "a lot" while still appropriately sizing all the parameters.

### Stuck AMM

The traditional approach of simply adding tokens to a pool on Uniswap results in a situation where the price can get 'stuck'.

This means that early FOMO causes the first buyers pump the price very high on a single exchange, then nobody else can buy until some of these early buyers then sell tokens back to the AMM (direct spot price drop) or the market (arbitrage opportunity to recover price).

Given that the whole point of distributing tokens is to get them in the hands of fans who should want to hodl them up to and beyond the start of the redemption period, we do NOT want to rely on secondary market selling just to allow more buyers to join.

Put another way, the traditional approach _relies on scalpers_ to acheive smooth price discovery rather than a single pump then price stagnation.

The mitigation is to use a combination of weights and amounts to define the spot price. This allows the weights to be adjusted downwards, lowering the spot price _without_ trades occuring, rewarding _later_ participants who are patient enough to allow the weights to give a better price for the same token supply in the AMM.

Rewarding later participants rewards patience.

Patient token buyers are more likely to be patient token hodlers.

Patient token hodlers are more likely to enjoy and maximise the redemption phase.

For example, Uniswap has a fixed weight of 1:1 and relies on arbitrage with external systems to maintain a fair spot price (i.e. Uniswap by definition assumes whatever token quantities are in any given pool are always of equivalent value).
Balancer does NOT assume the tokens in a given pool are of equal value, it allows any weighting of either token up to a 50:1 ratio (i.e. the total value of one token is up to 50x more than the other token).
When we can change the weighting of the tokens we can change the spot price without changing the token amounts.

The weight curve is defined during the `Trust` deployment and kicked off during `anonStartDistribution`.

Anyone can call the "update weights gradually" function on the pool, it is a public method, which brings the pool _weights_ back to the predefined curve according to the current block, which brings the spot price down. This means an arbitrage opportunity _against the weights_ exists and grows each block, where any user can call the weight recalculation function to give themselves a better spot price for the trade they want to make.

Ignoring stampedes (many redundant weight updates in the same block) and MEV/front-running (another user positions their trade after the rebalance but before the desired trade), it is always profitable to rebalance the weights if the new spot price is better than the fees of the rebalance. This is because the weights monotonically drift downwards towards the book value floor.

#### Overweight pool

Balancer pools can never exceed a combined weight of `50` as the sum of the weights of the tokens.

This is true even during a single operation so Balancer recommend never setting weights at exactly `50` if they need to change.

We do need them to change according to the reweighting curve so there is a `POOL_HEADROOM` constant (currently `10 ** 18` which is "one" for Balancer math).
We require that the `Trust` bootstraps with combined weights equal to or lower than `BalancerConstants.MAX_WEIGHT - Constants.POOL_HEADROOM`.

### Impermanent loss && price dumping

Impermanent Loss (IL) is a near-ubiquitious issue in AMMs to be mitigated or at least discussed.

In our case, because the Trust enforces that 100% of the freshly minted token is provided as liquidity in the AMM pool, the concept of IL doesn't quite apply.

While it is true mathematically that, had the Trust hodled the tokens instead of providing them as liqudity, it would receive more value than putting them on the market, this is nonsensical in practise as hodling 100% of the tokens implies that there is no distribution and therefore no meaningful market!

The worst case scenario is that zero trades occur, or equivalently, 100% of the token supply is dumped back into the pool in the same block that redemptions are unblocked.
In the worst case scenario, because the final weights are calculated against the final valuation that covers at leat the seeder, and the excess is forwarded to token holders, even the maximum theoretical token dump is safe for participants (albeit disappointing).

### Pool dust

Balancer pools cannot be totally shutdown (this has been confirmed by the Balancer team) so the larger of `10^-7` times the final reserve or `10 ** 6` absolute units of the reserve will be trapped in the pool on distribution end.

This is unavoidable but usually harmless. The limitation gets worse for reserve assets with fewer `decimals`. For example, USDC and USDT only support `6` decimals rather than the standard `18` decimals for native erc20 tokens. This means that the minimum pool dust is $1 of USDC or USDT.

For this reason we require that the minimum seed is `10 ** 8` ($100 for stables) so that the maximum theroetical pool dust is capped at 1% of the initial seed.

This could make tokens with very small decimals in the range of `0 - 5` infeasible as reserve assets due to the minimum seed requirements being too large in the reserve denomination.

### Rounding errors

There are some rounding errors when burning/redeeming tokens that can cause the pro-rate token calculations to differ by one or two in absolute terms between otherwise identical redemptions.

For tokens with `10 ** 18` decimals this should be harmless as the rounding error will be `10 ^ -18`.

For tokens with very small decimals this may be problematic.

### Whales

Whales are a double edged sword in general.

On one hand it is great when a large investor takes interest in a project as it is a big vote of confidence.

Whales may represent a buyer with long term goals well aligned with the team, or they may simply be taking advantage of a short term exploitable situation.

The redeemable tokens being bootstrapped here are designed specifically for fans of the underlying IP to participate in Tokens-as-an-Event (`TaaE`).

While healthy speculation (free market price discovery) is one of the main goals of the distribution and redemption mechanisms, outright market manipulation for the gain of a few actors with disproportionate control over price is NOT desirable (e.g. pump and dump).

One of the difficulties of mitigating whales is that there is always grey area in defining what 'a whale' is and what the difference between 'price discovery' and 'manipulation' is,

Commonly whales also have ready access to 'soft' control over the marketplace like bots, hired technocrats, insider information, etc. in addition to their raw buying power.

Rather than trying to define rules or whitelisting accounts or taking a 'top down' approach we choose to disincentivise whales at the level of the token and AMM mechanics.

0. The Dutch Auction style AMM means that whales cannot bulk buy in the first block with a bot to achieve immediate control over the token
0. The Trust contract minting and controlling 100% of the supply (rather than the trust owner) means that nobody can 'premint' tokens for their whale-friends behind closed doors
0. The transaction freezing in the redemption phase means that whales have no ability to trade publically or privately in order to manipulate market prices, only their personal relationship with their own holdings are relevant in this phase

### Scalpers

Scalpers are always bad for users who want to use the token for its utility.

Scalpers have no intent on using (hodling for rewards) the token and simply want to arbitrage 'being first in line' against 'not being first in line' for some scarce resource.

In a traditional setting (e.g. tickets for a live event) scalpers are also bad for the event producer because they extract value from the event without adding value (i.e. the event producer receives less money than they could have).

In a setting where the AMM is initialized with 100% of the token supply the event producer theoretically benefits from scalping as they ultimately exit with the total premium of all trades.

In reality scalping still hurts the creator as well as users because the premium relative to the reserve asset should reach an equilibrium with the expected value of the rewards during the redemption phase. If a scalper manages to put a large premium on the token price paid by users of the utility of the token then the redemption phase will be less valuable - i.e. the creator will need to produce more value to at their own cost match the premium gap that the scalper extracted for themselves. Intuitively, using the live concert example, the event producer may be targeting $100 of value per ticket but scalpers pushing the price up to $200 per ticket will inevitably warp the event-goers expectations of 'good value' despite being fully aware of the scalping premium.

Scalping is mitigated by starting the price much higher than the creator expects anybody to pay, i.e. the creator is communicating to the audience "I don't intend to produce that much value for _any_ user, so please wait for the weights to settle a bit before aping in." This also removes both the ability to (no early low price) and incentive to (expectation setting) scalp tokens.

### Rampant speculation

Speculation is the norm in crypto assets.

We want to create a _relatively_ safe environment for our users.

This means the token should never go to zero (bad for hodlers) or to the moon (prices out new participants).

We don't subscribe to the idea that speculation is zero sum because token sales by the creator ultimately pay the cost of producing the value created by the creator, regardless of whether an individual trader takes a profit or loss. As long as there are users buying the token with the primary goal to achieve newly created value, and the creator delivers on this value creation, then issuance and purchase of the token is a win/win for the creator and token holders.

So _some_ speculation is healthy and even fun but as all good things, in moderation.

We effectively clamp the speculation between an upper and lower bound.

Token holders should be actively educated and encouraged to never buy above the initial spot price, because they can always wait for the weights to rebalance and bring the price down.

The spot price on the Balancer AMM can never drop below the redemption/book value because this is equivalent to dumping 100% of all tokens minted back to the AMM at the very final block of the weight redistribution, i.e. the lowest price. The redemption value is a fixed minimum because nobody, not even the creator or deployer, can withdraw the reserve token from the redeemable token without calling the `redeem` function. The redemption value can increase over time due to additional reserve deposits but never drop below the floor established at `Trust` initialization (sans gas fees).

If you subscribe to the idea that crypto assets 'have no intrinsic value' and therefore they are 100% speculative, then having this token drop to the redemption value is the same as it dropping to zero. I.e. when the token reaches the book value, 100% of the speculative premium has been lost. However, by setting a redemption value for the token, we force buyers to match a non-zero non-speculative value on the token that locks up capital before they can consider speculating.
When a buyer purchases a vanilla ERC20 on the open market, 100% of the price they pay is subject to speculation (loss), whereas a redeemable token may be valued as 50% speculative and 50% stable/reserve, which should dampen price swings similar to a traditional diversified portfolio of assets.

### Front running && MEV

Balancer does NOT have a general solution for front-running or MEV as far as I am aware.

The general problem is that someone (bot) can observe the mempool (pending transactions), the state of the blockchain including all available contracts, and execute some combination of transactions before and after (an arsehole sandwich) that profits the bot at the expense of the owner of the pending transaction as it finalises.

A simple and relevant example is slippage on an AMM. If Alice places a large trade with 10% slippage then Bob can buy ahead of Alice (by being a miner or paying more gas to a miner), forcing Alice to pay an even higher price due to Bob's slippage, then Bob can immediately dump (by being a miner or paying slightly less gas to a miner) and arbitrage Alice's slippage.

This problem is old, it is called 'front running' because brokers would literally run between desks to place their own trades ahead of the trades of their client's.

The LBP does have a saving grace in that it passively incentivises relatively small and patient trades through the weight rebalancing. Ignoring gas fees, a simple and safe strategy as a participant in the distribution phase is to Dollar Cost Average (DCA) into the pool to minimise slippage and take advantage of lowering weights without missing the opportunity of high stock of token on sale.
Small trades are less profitable to front run as the slippage and therefore arbitrage opportunity is smaller in both percentage and absolute terms for the bot.

The Balancer contract _mitigates_ front running and slippage opportunities by exposing parameters that will revert the transaction if a minimum price is exceeded.
If the parameters are set sensibly then any attempt at front-running (or an extra frothy market) will trip the safety on the trade and it will fail. The buyer will still need to pay gas up to the point of the reversion but they will not be forced to accept malicious or extreme slippage.

__The GUI SHOULD expose or set the price thresholds for each trade to mitigate front-running.__

### Rug pull

A rug pull is a common scam where a 'team' (usually anon) mints a token, creates an AMM pool (e.g. TKN/WETH), promotes the token and then after a significant amount of the counter token (e.g. WETH) accumulates they mint a huge amount of the token to clear out the AMM pool.

Effectively it is a reboot of the old ICO exit scams but facilitated by an AMM.

The `Trust` contract does not construct or mint any tokens that can be rugged as all token supply changes are behind functions owned/administered by the `Trust` itself.

### Non-delivery by the creator

__The creator CAN always fail to deliver meaningful value during the redeem phase__.

Any user that loses faith in the ability of the creator to deliver can always redeem their tokens during the redemption phase for a pro-rata withdrawal of the current balances of the `RedeemableERC20` contract.

The intent is that many (hundreds or even thousands) of `Trust` contracts are created over time by many creators.

This is mitigated by the curation of front ends that present `Trust` contracts to end-users. Obvious scams should be filtered out, leaving as high a ratio of well-intentioned creators as possible.

Even still, many creators will fail, as this is reality unfortunately. At some point the end-user must apply their own curation metrics before swapping tokens, deciding which creators are worthy of their trust.

## Flashloan attack

A flashloan involves a user borrowing a large amount of token X in order to execute a series of methods on arbitrary contracts for personal profit, then returning token X in the same block for zero collateral.

Flashloans amplify and lower the barrier to exploits that combine various economic incentives across multiple protocols into an aggregate extraction of value at the expense of users of the involved protocols.

Flashloan risk is generally very difficult to analyse, or even attribute blame to for purposes of insurance, as exploits become increasingly sophisticated and involve valid interactions between many separate protocols.

It is reasonable to assume that automated flashloan bots will be refined much like arbitrage bots, that constantly scan and simulate contract interactions then automatically execute any profitable trade.

Flashloans have also been used to manipulate the voting process of 'governance tokens'.

The usual mitigation strategy is to require at least one block to complete between acquisition of a token and the ability to use it in some functionality.

It is reasonable to assume that future contracts MAY develop flashloan-like characteristics that can span multiple blocks.

Our hybrid model is resistant to flashloans in their current form and probably future unknown evolutions of it:

- Each TaaE token has distinct and fixed distribution and redemption phases so trading can never influence redemption
- Redemption is a one way event and tokens are fixed during redemption, so flash loans are impossible because transfers are impossible
- Redemption tokens have no utility during the distribution phase, there are no rewards, no voting, no contract interactions from creators during distribution that can be manipulated by a loan
- The Balancer pool is preconfigured so that maximum dump of the token is equivalent to the book value of the reserve, the theoretical worst case market action on the LBP is that the seeder has their reserve returned to them and no users participate in the redemption phase
- 100% of the token supply is provided to the LBP at its inception so there are no outside sources of liquidity to manipulate other than user-initiated secondary markets derived from the LBP during the distribution phase

## Choice of reserve asset

None of the code in this system has any control over the reserve asset code.

It is up to the `Trust` deployer and each participating user to conduct their own risk assessment of the reserve asset.

For example:

- Stable coins may introduce regulatory risk, e.g. the American STABLE Act or similar may suddenly apply to a reedeemable token
- Centralised stable coins could censor the redemption or pool mechanisms by blocking transfers beyond our control
- The reserve asset could experience its own exit scams and/or exploits
- The reserve asset could somehow be 'wound down' out from underneath users who want to redeem against it

It essentially comes down to counterparty risk (e.g. tether) + technical risk (e.g. hacks) + value risk (e.g. worthless/volatile reserve).

Rough analysis of notable assets:

- WETH: Zero counterparty risk, low technical risk, high value risk
- USDC/DAI: Some counterparty risk, some technical risk, low value risk
- NFT/partner token: Some counterparty risk, some technical risk, very high value risk

## Contract upgrades && admin keys && hacks && exploits

TaaE tokens have fixed scope and duration.

Every phase change, from bootstrap, distribution and redemption is one-way with predictable timing.

The final state of the system is that hodlers receive rewards and slowly drop out to the underlying asset as a one-way move, or hold a frozen asset indefinitely if they choose to.

Every new token event requires a new `Trust` with its own lifecycle.

If a vulnerability is found in a version of the `Trust` the theoretical maximum damage of an exploit is capped at the current locked reserve across the pool and token across vulnerable `Trust` contracts.

By versioning and newly deploying `Trust` contracts, any fix to a discovered exploit will be available for all new `Trust` contracts after that point.

There are no admin keys as the `Trust` performs all administrative tasks on the child contracts.
