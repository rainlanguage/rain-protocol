---
id: glossary
slug: /glossary
title: Glossary
---

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
