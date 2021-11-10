`TierByConstructionClaim` is a base contract for other contracts to
inherit from.

It builds on `TierByConstruction` with a `claim` function and `_afterClaim`
hook.

The `claim` function checks `onlyTier` and exposes `isTier` for
`_afterClaim` hooks so that accounts can self-mint rewards such as erc20,
erc1155, erc721, etc. if they meet the tier requirements.

The `claim` function can only be called once per account.

Note that `claim` is an unrestricted function and only the tier of the
_recipient_ is checked.

Implementing contracts must be careful to avoid griefing attacks where an
attacker calls `claim` against a third party in such a way that their
reward is minimised or damaged in some way.

For example, `ERC20BalanceTier` used with `TierByConstructionClaim` opens
the ability for an attacker to `claim` every address they know that has not
reached the minimum balance, permanently voiding that address for future
claims even if they reach the minimum balance at a later date.

Another example, `data_` is set to some empty value by the attacker for the
`claim` call that voids the ability for the recipient to receive more
rewards, had the `data_` been set to some meaningful value.

The simplest fix is to require `msg.sender` and recipient account are the
same, thus requiring the receiver to ensure for themselves that they claim
only when and how they want. Of course, this also precludes a whole class
of delegated claims processing that may provide a superior user experience.

Inheriting contracts MUST implement `_afterClaim` with restrictions that
are appropriate to the nature of the claim.



## Details
Contract that can be inherited by anything that wants to manage claims
of erc20/721/1155/etc. based on tier.
The tier must be held continously since the contract construction according
to the tier contract.
In general it is INSECURE to inherit `TierByConstructionClaim` without
implementing `_afterClaim` with appropriate access checks.

## Variables
### `enum ITier.Tier` `minimumTier`

### `mapping(address => bool)` `claims`


## Events
### `Claim(address account, bytes data)`

A claim has been successfully processed for an account.





## Functions
### `constructor(contract ITier tierContract_, enum ITier.Tier minimumTier_)` (public)

Nothing special needs to happen in the constructor.
Simply forwards the desired ITier contract to the `TierByConstruction`
constructor.
The minimum tier is set for `claim` logic.



### `claim(address account_, bytes data_)` (external)

The `onlyTier` modifier checks the claimant against minimumTier.
The ITier contract decides for itself whether the claimant is
`minimumTier` __as at the block this contract was constructed__.
This may be ambiguous for `ReadOnlyTier` contracts that may not have
accurate block times and fallback to `0` when the block is unknown.

If `account_` gained `minimumTier` after this contract was deployed
but hold it at the time of calling `claim` they are NOT eligible.

The claim can only be called successfully once per account.

NOTE: This function is callable by anyone and can only be
called at most once per account.
The `_afterClaim` function can and MUST enforce all appropriate access
restrictions on when/how a claim is valid.

Be very careful to manage griefing attacks when the `msg.sender` is not
`account_`, for example:
- An `ERC20BalanceTier` has no historical information so
anyone can claim for anyone else based on their balance at any time.
- `data_` may be set arbitrarily by `msg.sender` so could be
consumed frivilously at the expense of `account_`.





### `_afterClaim(address account_, uint256 report_, bytes data_)` (internal)

Implementing contracts need to define what is claimed.



