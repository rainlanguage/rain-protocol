---
id: introduction
slug: /
title: Introduction
---

Rain Protocol supports fair value capture for intangible or physical assets in a permissionless way in any decentralised environment.

We use Balancer's [Liquidity Bootstrapping Pool](https://docs.balancer.finance/smart-contracts/smart-pools/liquidity-bootstrapping-faq) to distribute the tokens.

The goal is to achieve something analogous to KickStarter where specific projects and events are made possible through a one-time fundraising.

## Overview

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

The `Trust` has native integration with the `ITier` membership system included as a git submodule. Any account that does not have a minimum membership status cannot receive the distributed token and so cannot participate. This allows additional requirements to be placed on the participants by the deployer of the trust.

## A note on regulatory compliance

Any legal or regulatory requirements such as KYC/AML or securities law are the responsibility of the stakeholders.

The stakeholders are:

- The deployer of the `Trust` contract who provides all the initial configuration parameters and pays the gas for deployment
- The creator who is raising money to create some new value in the world
- The token holders who trade tokens during the distribution phase on the Balancer pool and then hold frozen tokens after the distribution finishes
- The seeder who provides the initial tokens on the other side of the Balancer trading pool to bootstrap trading

Without offering legal advice, one hypothetical way this could look (something like KickStarter):

- The creator and deployer of the `Trust` creates a `ITier` contract that allows only close friends and family to hold a membership status
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