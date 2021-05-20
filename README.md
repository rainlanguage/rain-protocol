# Terra Virtua x Balancer

Implements a hybrid wrapped ERC20 + [Liquidity Bootstrapping Pool](https://docs.balancer.finance/smart-contracts/smart-pools/liquidity-bootstrapping-faq) with bespoke 'Last Wallet Standing' mechanic.


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

## Why a token??

> An engineer has a problem.
> Tries to solve it with a token.
> The engineer has two problems.

Notably TV already has a token, the `TVK` token that is being actively bootstrapped.

Surely anything that dilutes attention and diverts liquidity away from `TVK` is a liability?

These tokens are short term wrappers around a reserve asset so that people can participate in an event/membership without losing exposure to the underlying reserve.

It allows TV to tailor specific events to fans of a specific IP rather than simply airdropping rewards blindly to all current `TVK` hodlers.

So `TVK` can be the reserve asset for a redeemable token and when redemptions open the `TVK` can be recovered as-is.
This has the effect of locking up `TVK` supply within the token during the distribution phase and until everyone exits during the redemption phase.

The mechanism differs from staking in that:

- Hodling a redeemable token is incentivised by rewards denominated in things _other than itself_ so it is not confusing inflation (dilution) with dividends (new value)
- Redemption is a one-way event whereas staking can be entered and exited relatively freely
- Value accrual is increasingly concentrated between remaining hodlers as others exit to liquidity, we call this 'Last Wallet Standing'
- Hodlers are guaranteed a minimum exit value fixed at the system inception denominated in the reserve asset (i.e. something other than itself)

The value of a redeemable token is a combination of all of:

- The book value of the asset it is redeemable for
- The speculative potential _future_ rewards that hodling it might realise (e.g. NFT airdrop, exclusive event access, etc.)
- The social status of provably and publically participating in an exclusive event tied to creative IP and not exiting (proof of fandom)

The value of a redeemable token is NOT a circular reference to itself or derived from speculative trading because after redemption _all transfers/trades are frozen_.

The distribution is based on a one-time fixed-duration dutch auction facilitated by a dedicated Balancer Liquidity Bootstrapping Pool (see below).

## Wrapped ERC20

`RedeemableERC20.sol` implements an `Ownable`, `Initable`, `BlockBlockable` 'redeemable' `ERC20`.

`ERC20` is as per the [Open Zeppelin contract](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol).

`Ownable` is as per the [Open Zeppelin contract](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol).

`Initable` is _similar_ to the `Initializable` [Open Zeppelin contract](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Initializable.sol) but with slightly different goals (see below).

`BlockBlockable` is a _one time_ switch that unblocks certain contract functionality when a specified block exists.

Similar mechanics to wrapping but with additional rules.

### Lifecycle

The token lifecycle is split into three distinct phases: 'bootstrap', 'distribution', 'redemption'.

The bootstrap phase is the requisite configuration and token transfers that the owner needs to initialize.

The distribution phase is a [Dutch Auction](https://www.investopedia.com/terms/d/dutchauction.asp) _simulation_ as a Balancer Liquidity Bootstrapping Pool.
There are some technical differences between a Balancer Liquidity Bootstrapping Pool and a 'true' Dutch Auction (see below).

0. During construction the basic parameters are defined:
     - The name and symbol for the redeemable token to be created
     - The `_reserve` ERC20 token to be wrapped e.g. TVK, DAI, USDC, WETH, etc.
     - The amount `_reserve_init` of the reserve token to be deposited in the token during initialization
     - The `_mint_ratio` which is the number of redeemable tokens minted per reserve token deposited
     - `mint_ratio`, `reserve_init` and `reserve` become available as immutable public getters
0. After construction the owner of the redeemable token MUST approve _exactly_ the number of reserve tokens `_reserve_init` defined in construction.
0. Once the reserve tokens are approved the owner can `init` the redeemable token and set the `_unblockBlock`
     - The redeemable contract will transfer `_reserve_init` reserve tokens from the owner to itself
     - The redeemable contract will `_mint` ( `_reserve_init` x `_mint_ratio` ) of itself for its owner
     - The `unblockBlock` becomes available as an immutable public getter
0. After the contract is initialized but before it is unblocked:
     - The owner can add 'unfreezable' addresses
     - All token holders can freely transfer the minted ERC20 as per OZ ERC20
     - But redeemable tokens cannot be sent to the redeemable token contract
0. After the contract is unblocked (the predefined `unblockBlock` exists)
     - All ERC20 transfers are frozen except TO addresses on the unfreezable list.
     - `redeem` is now callable by everyone

### Redemption

In the final stage of the redeemable token lifecycle redemptions are open.

Calling redeem with `_redeem_amount` will `_burn` the tokens being redeemed and send pro rate reserve token to the caller.

A `Redeem` event is emitted as `(msg.sender, _redeem_amount, _reserve_release)`.

Example:

- 1 000 000 redeemable tokens in current `token.totalSupply()`
- 1 00 000 reserve tokens in current `reserve.balanceOf(address(token))`
- `msg.sender` has sufficient redeemable balance to call `_redeem_amount` of 100 000 (10% of redeemable supply)
- 100 000 redeemable tokens are burned so that the new `token.totalSupply()` is 900 000
- 10 000 reserve tokens are transferred from the token contract to `msg.sender`

Redemption is a one-way, one-time deal.

Sending reserve tokens to the token contract will only make subsequent redemptions more valuable.

This is what we call 'Last Wallet Standing':

- There is no 'undo' for redemption
- _Potential_ rewards MAY continue to accrue to the token holders:
  - Raw reserve token additions increase `redeem` amount
  - Access to exclusive events, etc.
  - Airdrops, NFTs, etc.
  - Social status
- Hodling in the redeemable token after `unblockBlock` incurs opportunity cost due to frozen liquidity
- As hodlers redeem for liquidity future rewards are increasingly concentrated to the remaining holders

There is a natural but subjective and individual equilibrium where each hodler chooses to redeem for liquidity after receiving a certain number of rewards.

At some point each hodler's satisfaction with rewards to-date and expectation of future rewards crosses the opportunity cost to them of not redeeming to the liquid reserve, and then they call `redeem`, which in turn feeds back into the same calculus for each other hodler.

## Liquidity Bootstrapping Pool

The 'Liquidity Bootstrapping Pool' (LBP) is a style of AMM developed by Balancer.

It simulates a Dutch Auction through Balancer's spot price mechanism as a combination of weight and relative token amounts.

Empirical evidence from the [PERP token distribution](https://medium.com/balancer-protocol/a-new-paradigm-for-token-distribution-c82de13626bb) indicates this is a strong mechanism to achieve a wider and 'fairer' distribution of tokens than a simple AMM listing.

Fairness is hard to define objectively, but for our purposes we want to:

- Minimise scalping, i.e. users buying early with the intent to sell at a higher price to users who want the token utility
- Maximise the value unlocked by the distribution in terms of the reserve token for Terra Virtua so that maximum rewards can be funded and Terra Virtua team is rewarded for their efforts and risk
- Mimimise whales, i.e. users who buy a significant percentage of the total token supply with the intent to manipulate the price paid by users who want the token utility
- Allow for subjective valuation by users who want the token utility
- Protect the interests of users who want to hodl the token for its utility
- Avoid economic exploits that allow users to leverage mechanisms provided by other smart contracts to extract value from the pool for themselves (e.g. flash loan style attacks)
- Allow for efficient price discovery
- Mitigate 'front running' where a user (bot) sends orders in advance of (with higher gas than) another trade when it is visible in the mempool but not yet included in a block, in order to force the other user to pay a higher spot price and then immediately dump on this (almost) guaranteed higher price

The [Balancer Whitepaper](https://balancer.finance/whitepaper/) outlines the formulas and proofs (relevant extracts in the comments in this codebase) used to define spot price (and therefore marketcap of input token in terms of output token) in terms of amount and weight of each token in the pool.

We use a model similar to startup valuations for defining initial start and end weights internally.
For example, an early stage investor may offer a founder $100 000 for 10% equity, immediately valuing the company _equity_ at $1 000 000 regardless of the _book value_ of the underlying assets (which may be close to $0 for a new company).
We do the same thing by setting aside ( 1 / ( book_ratio + 1) ) of the total reserve to _define_ the initial implied marketcap for the distribution phase and ( book_ratio / ( book_ratio + 1 ) ) of the total reserve to _back_ the redemption phase of the token.
By this model the initial weight of the balancer pool will be larger than the book ratio if the aspirational/maximum marketcap is to be larger than the redemption value of the token.
Similarly there is an intentional discrepency between the implied market cap of the initial spot price (set very high, drifting downwards in an LBP) and the book value (redemption value of 1 token during the redemption phase).

The target/final weights of the distribution phase give a spot price equal to the book value of the token _assuming no trades_.
This means the maximum possible dump of the pool at the lowest possible weight (i.e. 100% of all tokens are dumped) is equal to the book value.

The [Balancer documentation](https://docs.balancer.finance/) is the best reference for more details on how this works.

### RedeemableERC20Pool

The Balancer functionality is wrapped by the `RedeemableERC20Pool` contract.

This contract exposes a constructor and `init` so that the `Trust` contract can treat the Balancer weight calculations and setup as a 'black box'.

This means that the pool tokens created during the initialization of the Balancer LBP _are owned by the `RedeemableERC20Pool` and never touch either the `Trust` nor a TV controlled wallet directly.

The `exit` method on the `RedeemableERC20Pool` is callable only by the owner (the `Trust`, not TV) and only after the unblock block exists.

## Trust

The `Trust` contract is what the TV wallet deploys and implements "can't be evil".

The only things that TV can do that the general public cannot for a given pool:

- Construct it with the base parameters such as the reserve, ratios and initial marketcap
- _Provide_ the initial reserve token that will be split according to the book ratio between the pool and the redeem phase
- Initialize the unblock block
- Recover pool funds + proceeds of the token sale + unclaimed tokens after the unblock block exists

TV never touches any token minting (neither the pool tokens nor the redeemable tokens) or redemption directly (other than how the general public can).

The `Trust` exposes its own `exit` method that forwards to the `RedeemableERC20Pool` and then transfers the total reserve token ( proceeds of trading + redemption of remaining token stock ) as a lump sump back to the TV wallet that owns the `Trust`.

The trust exposes the addresses of its various components as public so each can be viewed and interacted with according to its own public methods.

## Risk mitigation

### Audits && optimisations

__These contracts are NOT audited.__

__These contracts are NOT gas optimised.__

__There have been NO simulations designed or run.__

The details documented here:

- Are based on a pre-audit code implementation
- Have low-medium automated test coverage that demonstrates basic mechanics non-exhaustively
- Are subject to change in the face of a security challenge, deployment blocker or other Good Idea

### Iterative value locked and accrued

The intent is to deploy many iterations of this code, each with a relatively small reserve so that the basic mechanics can be battle tested with capped risk for each iteration.

Each iteration has a fixed point after which all tokens are frozen and (barring some critical bug) pro-rata redeemable for at least the value of the underlying reserve asset.

The bootstrap-distribute-redeem-reboot lifecycle provides a natural safety net against exploits and entry point for future functionality without an ever-growing honey pot to secure behind a single code deploy.

### Minimum raise threshold

The Trust contract has a minimum raise parameter (can be zero).

When the Trust contract `exit` is called the total reserve asset in the pool after redeeming any excess tokens is compared to the initial reserve total across both the pool and the tokens.

The Trust contract `exit` is public and can be called by anyone, this is to stop the Trust owner holding the overall process hostage in the case of a failed raise (blocking end-users getting their refunds). Internally this delegates to the pool's `exit` function which can only be called by the owner (the Trust) and after the unblock block, so it cannot be called early even though it is public.

If the difference before and after the distribution period is less than the minimum then the Trust owner will be refunded their initial reserve and the remainder will be forwarded to the redemption token reserve.

This means the Trust owner will either meet their minimum raise or be refunded in full, minus gas and dust.

Token holders can then use the existing redemption mechanism to receive their refund from the token reserve, which now contains 100% of the funds raised above the pool reserve. Token redemption is always pro-rata, so refunds are __in aggregate if the raise fails__.

Users that paid above average for their tokens will receive less of the refund and users who paid below average will receive more of the refund. It is possible for users to make a profit in the case of a failed raise if they buy when the price is low. We don't want to base our incentives around the case of a failed raise, but it is a real incentive to be patient and buy when the price is lower than average.

If the raise is successful then __all the proceeds go to the Trust owner__. The token holders are entitled to the rewards + book value of the token that was backed by the owner at the start of the raise. It is expected that the Trust owner will use the proceeds of the sale to cover costs of producing the rewards for token holders, plus some reasonable margin.

Other than gas and dust it is not possible that the Trust owner loses their initial depost. In the absolute worst case scenario, where nobody buys any tokens at all, or equivalently tokens are purchased and subsequently 100% of tokens are dumped back in to the AMM, the final weight in the balancer pool sets a spot price equal to the book value of the tokens.

If 100% of the total supply of the minted tokens at the final (lowest) balancer weight gives a spot price equal to the book price then the reserve tokens in the AMM pool + redemption of unsold tokens is always equal to or greater than the initial reserve across the pool and token redemption reserve.

This is because the lowest possible spot price offered by the AMM moves exactly the book price from the sold tokens into the AMM pool 1:1. All other prices offered by the AMM move more than the book price into the AMM pool.

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

The weight curve is set during the Trust initialization, it starts at the init block and ends at the unblock block.

Anyone can call the "update weights gradually" function on the pool, it is a public method, which brings the pool _weights_ back to the predefined curve according to the current block, which brings the spot price down. This means an arbitrage opportunity _against the weights_ exists and grows each block, where any user can call the weight recalculation function to give themselves a better spot price for the trade they want to make.

Ignoring stampedes (many redundant weight updates in the same block) and MEV/front-running (another user positions their trade after the rebalance but before the desired trade), it is always profitable to rebalance the weights if the new spot price is better than the fees of the rebalance. This is because the weights monotonically drift downwards towards the book value floor.

#### Overweight pool

Balancer pools can never exceed a combined weight of `50` as the sum of the weights of the tokens.

This is true even during a single operation so Balancer recommend never setting weights at exactly `50` if they need to change.

We do need them to change according to the reweighting curve so there is a `POOL_HEADROOM` constant (currently `1`).
We require that the `Trust` bootstraps with combined weights equal to or lower than `BalancerConstants.MAX_WEIGHT - Constants.POOL_HEADROOM`.

### Impermanent loss && price dumping on TV

Impermanent Loss (IL) is a ubiquitous issue in AMMs to be mitigated or at least discussed.

In our case, because the Trust enforces that 100% of the freshly minted token is provided as liquidity in the AMM pool, the concept of IL doesn't quite apply.

While it is true mathematically that, had the Trust hodled the tokens instead of providing them as liqudity, it would receive more value than putting them on the market, this is nonsensical in practise as hodling 100% of the tokens implies that there is no trading or price discovery!

Discussion of IL typically ignores that a large part of price appreciation is _due to liquidity_. Traders are perfectly aware that selling a token will incur slippage whether on an AMM, order book or OTC. If liquidity of a token is super low it is simultaneously subject to volitility within a single trade (i.e. slippage on the sell) and in aggregate across all trades on the market (i.e. high volatility leading to rapid price dumps instantly after any pump when traders attempt to realise gains).

Hodling 100% of the supply of a token means 0 liquidity which means infinite uncertainty in the price, which to be clear is nonsense.

As we set the initial implied marketcap (calculated from the reserve deposited in the pool and initial weights) very high, and the final implied marketcap at the book (redemption) value of the token, the Trust is immune to impermanent loss.

Any and all trades that result in a net withdrawal of tokens from the LBP result in a material gain for the TV team at exit.

The worst case scenario is that zero trades occur, or equivalently, 100% of the token supply is dumped back into the pool in the same block that redemptions are unblocked.
In the worst case scenario, because the final weights imply a total market cap equal to the redemption value of the tokens, the TV team will simply recover the reserve tokens they initially deposited in the token and pool, minus gas fees and dust.

### Dust

The system does tend to accumulate dust in terms of the reserve token.

Notably this occurs in two ways:

- Balancer pools cannot be totally shutdown (I couldn't see how) so `10^-7` of the reserve will be trapped in the pool on exit (difference between max and minimum allowable pool tokens in a single join/exit)
- Irrational math that doesn't fit in the 18 decimals standard to ethereum

The former is relatively harmless, the value lost for the TV team on exit is negligible and the dusty pool is impossible to interact with because A. the redeem token is frozen after exit and B. even if it wasn't the slippage is near infinite.

The latter is _usually_ harmless in that it might for example, make two identical redemptions differ by about 10^-15 in magnitude, which is not going to materially impact any human.

There is a notable exception where dust may cause problems - during the initialization of the contracts, there are two different codepaths for creating the token and the pool based on the book ratio, so it may be possible for initialization of the trust to fail due to slight discrepencies in balances and allowances.

This failure is entirely deterministic so can be mitigated by either:

- Performing a dry run of the parameters locally to smoke test any reversions during init of the `Trust`
- Selecting parameters that will not incur irrational math during initialization based on book ratio etc.

### Whales

Whales are a double edged sword in general.

On one hand it is great when a large investor takes interest in a project and backs devleopment of the team.

Whales may represent a buyer with long term goals well aligned with the team.

In this context however, it would make more sense for the whale to buy the `TVK` token to support the team in this way as that is the liquid asset.

The redeemable tokens being bootstrapped here are designed specifically for fans of the underlying IP to participate in Tokens-as-an-Event (`TaaE`).

While healthy speculation (free market price discovery) is one of the main goals of the distribution and redemption mechanisms, outright market manipulation for the gain of a few actors with disproportionate control over price is NOT desirable (e.g. pump and dump).

One of the difficulties of mitigating whales is that there is always grey area in defining what 'a whale' is and what the difference between 'price discovery' and 'manipulation' is,

Commonly whales also have ready access to 'soft' control over the marketplace like bots, hired technocrats, insider information, etc. in addition to their raw buying power.

Rather than trying to define rules or whitelisting accounts or taking a 'top down' approach we choose to disincentivise whales at the level of the token and AMM mechanics.

0. The Dutch Auction style AMM means that whales cannot bulk buy in the first block with a bot to achieve immediate control over the token
0. The Trust contract minting and controlling 100% of the supply (rather than the trust owner) means that Terra Virtua cannot 'premint' tokens for their whale-friends behind closed doors
0. The transaction freezing in the redemption phase means that whales have no ability to trade publically or privately in order to manipulate market prices, only the market price of the rewards vs. the underlying reserve asset are relevant in this phase

### Scalpers

Scalpers are always bad for users who want to use the token for its utility.

Scalpers have no intent on using (hodling for rewards) the token and simply want to arbitrage 'being first in line' against 'not being first in line' for some scarce resource.

In a traditional setting (e.g. tickets for a live event) scalpers are also bad for the event producer because they extract value from the event without adding value (i.e. the event producer receives less money than they could have).

In a setting where the AMM is initialized with 100% of the token supply the event producer theoretically benefits from scalping as they ultimately exit with the total premium of all trades.

In reality scalping still hurts the team as well as users because the premium relative to the reserve asset should reach an equilibrium with the expected value of the rewards during the redemption phase. If a scalper manages to put a large premium on the token price paid by users of the utility of the token then the redemption phase will be less valuable - i.e. the TV team will need to produce more value to at their own cost match the premium gap that the scalper extracted for themselves. Intuitively, using the live concert example, the event producer may be targeting $100 of value per ticket but scalpers pushing the price up to $200 per ticket will inevitably warp the event-goers expectations of 'good value' despite being fully aware of the scalping premium.

Scalping is mitigated by starting the price much higher than TV expects anybody to pay, i.e. TV are communicating to the audience "we don't intend to produce that much value for _any_ user, so please wait for the weights to settle a bit before aping in." This also removes both the ability to (no early low price) and incentive to (expectation setting) scalp tokens.

### Rampant speculation

Speculation is the norm in crypto assets.

We want to create a _relatively_ safe environment for our users.

This means the token should never go to zero (bad for hodlers) or to the moon (prices out new participants).

We don't subscribe to the idea that speculation is zero sum because token sales by the team ultimately pay the cost of producing the value created by the team, regardless of whether an individual trader takes a profit or loss. As long as there are users buying the token with the primary goal to receive value created by the team, and the team delivers on this value creation, then issuance and purchase of the token is a win/win for the TV team and end-users.

So _some_ speculation is healthy and even fun but as all good things, in moderation.

We effectively clamp the speculation between an upper and lower bound.

Users should be actively educated and encouraged to never buy above the initial spot price, because they can always wait for the weights to rebalance and bring the price down.

The spot price on the Balancer AMM can never drop below the redemption/book value because this is equivalent to dumping 100% of all tokens minted back to the AMM at the very final block of the weight redistribution, i.e. the lowest price. The redemption value is a fixed minimum because nobody, not even the TV team, can withdraw the reserve token from the redeemable token without calling the `redeem` function. The redemption value can increase over time due to additional reserve deposits but never drop below the floor established at `Trust` initializtiaon (sans gas fees).

If you subscribe to the idea that crypto assets 'have no intrinsic value' and therefore they are 100% speculative, then having this token drop to the redemption value is the same as it dropping to zero. I.e. when the token reaches the book value, 100% of the speculative premium has been lost. However, by setting a redemption value for the token, we force buyers to match a non-zero non-speculative value on the token that locks up capital before they can consider speculating.
When a buyer purchases a vanilla ERC20 on the open market, 100% of the price they pay is subject to speculation (loss), whereas a TV token may be valued as 50% speculative and 50% stable/reserve, which should dampen price swings similar to a traditional diversified portfolio of assets.

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

### Gas fees

Ethereum is eating about [$50 million a day](https://cryptofees.info/) in gas fees at the time of writing at [100+ GWEI on a good day](https://ethereumprice.org/gas/).
This translates to something like $100+ per transaction on anything more complex than a single ERC20 transfer.

It is unlikely this will get better as the ethereum network is shifting rapidly from a 'payment processor' to a 'settlement layer'. Which translates to 'high security high fees'.

These contracts are way more complex than a single ERC20 transfer, especially to deploy, so it's NOT really feasible to deploy them to the ethereum mainnet.

Even if we are willing to pay the deployment fees that involve multiple ERC20 transfers, minting a new token, and initialization of a balancer pool, it's certain that "mainstream" users are not going to _enjoy_ paying $100 to buy $10 of TaaE tokens.
We really want people to enjoy using our system :)

- Currently we want to deploy to Matic/Polygon as an EVM compatible sidechain with lower fees.
- By designing the distribution phase to be of fixed duration and redemption to have frozen transfers we avoid needing to plan for far-future gas fees, if we have headroom for the next 3-6 months this should be adequate for now
- In the future we may even be priced out of sidechains, so we will need to look to alternative options and/or optimise the gas usage of these contracts
- Balancer is currently in ['Bronze'](https://github.com/balancer-labs/balancer-core/blob/master/contracts/BFactory.sol#L20) release, which means _they have not optimised their own gas yet either_. Maybe it will be significantly cheaper in the future.
- By paramaterising the Balancer backend and fixing the token scope/duration during initialization we can take advantage of Balancer upgrades without juggling proxy/upgrade contracts

__Balancer has NOT yet [published Matic mainnet addresses](https://docs.balancer.finance/smart-contracts/addresses)!!!__.

At the moment we can use the Matic testnet to test our contracts but have no go-live path until Balancer deploy.

We SHOULD contact the Balancer team re: timelines and/or blockers to derisk this.

### Rug pull

A rug pull is a common scam where a 'team' (usually anon) mints a token, creates an AMM pool (e.g. TKN/WETH), promotes the token and then after a significant amount of the counter token (e.g. WETH) accumulates they mint a huge amount of the token to clear out the AMM pool.

Effectively it is a reboot of the old ICO exit scams but facilitated by an AMM.

TV is NOT an anonymous team and relies on their reputation, goodwill and brand in order to continue operating effectively in the space.

Part of the TV reputation is that we can use Solidity to enforce "can't be evil" rather than the much weaker and retractible "don't be evil".

TV cannot rug pull their users with these contracts:

- The redeemable ERC20 token inherits from the audited Open Zeppelin ERC20 contracts
- The `_transfer` functions are NOT overridden
- The `_beforeTokenTransfer` explicitly reverts any transactions from the `0x0` address (i.e. `_mint` in the OZ contract) after initialization
- The redeemable ERC20 token is owned by the `Trust` contract, NOT a TV wallet, so we aren't even the owner of the token
- The pool is also owned by the `Trust` contract, NOT a TV wallet, so we cannot exit the pool without the `Trust` mediating the process
- All the admin functions for the redeemable token and redeemable pool use the audited `onlyOwner` from the OZ contracts, and _the `Trust` is the owner_ not a TV wallet
- Pool exit is a two step process that can only be initiated as token transfers are frozen and involves _redemption_ of the remaining tokens to the underlying reserve, redeemable tokens never touch a TV wallet, unless TV participates in the distribution auction on equal footing with the general public

### Early exit && non-delivery by TV

The `Trust` owns both the balancer pool (indirectly through the `RedeemableERC20Pool` contract) and the redeemable ERC20 tokens.

TV can initialize a trust but has no priviledged access to any functions modified as `onlyOwner`.

As the owner of the `Trust`, TV can request that the `Trust` attempt to `exit` on behalf of TV, which will call the underlying `exit` function on the `RedeemableERC20Pool` contract, which will revert before the preset `_unblockBlock` exists.

The unblock block is public and can only be set during initialization of the `Trust`.

As long as TV initializes the system through the `Trust` it is not possible for them to dump/exit the pool tokens early.

__TV CAN always fail to deliver meaningful value during the redeem phase__.

Any user that loses faith in the ability for TV to deliver meaningful (subjective or financial) value can always redeem their tokens during the redemption phase for their book value.

If TV truly fail to deliver on _any_ redeemable token, it would significantly and perhaps permanently damage their reputation, and hence their ability to successfully bootstrap future tokens.

The intent is that many (hundreds or even thousands) of redeemable pools are created over time, all with different value propositions, reserves, init and unblock times, and different backing IPs.

It is not possible that TV can simultaneously exit all the redeemable tokens at the same time (in contrast they could market dump their TVK balance at any time).

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
- Redemption tokens have no utility during the distribution phase, there are no rewards, no voting, no contract interactions from TV during distribution that can be manipulated by a loan
- The Balancer pool is preconfigured so that maximum dump of the token is equivalent to the book value of the reserve, the theoretical worst case market action on the LBP is that the TV have their reserve returned to them and no users participate in the redemption phase
- 100% of the token supply is provided to the LBP at its inception so there are no outside sources of liquidity to manipulate other than user-initiated secondary markets derived from the LBP during the distribution phase

## Choice of reserve asset

None of the code in this system has any control over the reserve asset code.

It is up to the TV team and each participating user to conduct their own risk assessment of the reserve asset.

For example:

- Stable coins may introduce regulatory risk, e.g. the American STABLE Act or similar may suddenly apply to a reedeemable token
- Centralise stable coins could censor the redemption or pool mechanisms by blocking transfers beyond our control
- The reserve asset could experience its own exit scams and/or exploits
- The reserve asset could somehow be 'wound down' out from underneath users who want to redeem against it

It essentially comes down to counterparty risk (e.g. tether) + technical risk (e.g. hacks) + value risk (e.g. worthless/volatile reserve).

Rough analysis of notable assets:

- WETH: Zero counterparty risk, low technical risk, high value risk
- USDC/DAI: Some counterparty risk, some technical risk, low value risk
- TVK: Zero counterparty risk (relative to the redeemable token), some technical risk, high value risk
- NFT/partner token: Some counterparty risk, some technical risk, very high value risk

## Contract upgrades && admin keys && hacks && exploits

TaaE tokens have fixed scope and duration.

Every phase change, from bootstrap, distribution and redemption is one-way with predictable timing.

The final state of the system is that hodlers receive rewards and slowly drop out to the underlying asset as a one-way move, or hold a frozen asset indefinitely if they choose to.

Every new token event requires a new Trust with its own lifecycle.

Rather than try to upgrade existing contracts in-situ, the TV team can apply updates to the Solidity code between `Trust` deployments.

If a vulnerability is found in a version of the `Trust` the theoretical maximum damage of an exploit is capped at the current locked reserve across the pool and token across vulnerable `Trust` contracts, plus the damage to TV's reputation.

By versioning and newly deploying `Trust` contracts, any fix to a discovered exploit will be available for all new `Trust` contracts past that point.

By separating the concerns of the redemption token and Balancer pool management, it is less likely that a single exploit can extract 100% of the reserve token from the system. It is more likely than an exploit would fully or partially drain the Balancer pool OR the token redemption method.

As there are no upgrades, admin functions or keys, if the TV wallet is compromised then TV loses their ability to `exit` the trust after the distribution phase but everything else will continue as initialized. End-users won't even notice that the TV wallet was hacked unless they are specifically tracking it on etherscan.
