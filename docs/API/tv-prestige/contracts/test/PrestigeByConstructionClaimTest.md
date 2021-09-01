## `PrestigeByConstructionClaimTest`

A simple example showing how PrestigeByConstruction can be used to gate a claim on an ERC20.

In this example users can mint 100 tokens for themselves if:

- They held GOLD at the time the claim contract is constructed
- They continue to hold GOLD status until they claim

The user can increase their status at any point but must never drop below GOLD between the relevant blocks.

If a user holds GOLD at construction but forgets to claim before they downgrade they can NOT claim.

This is just an example, the same basic principle can be applied to any kind of mintable, including NFTs.

The main takeaways:

- Checking the prestige level is decoupled from granting it (ANY IPrestige set by the constructor can authorize a claim)
- Claims are time sensitive against TWO blocks, for BOTH construction and claim (NOT a snapshot)
- Users pay the gas and manage their own claim/mint (NOT an airdrop)




### `constructor(contract IPrestige _prestige)` (public)

Nothing special needs to happen in the constructor.
Simply forward/set the desired IPrestige in the PrestigeByConstruction constructor.
The ERC20 constructor is as per Open Zeppelin.



### `claim(address account)` (external)

The onlyStatus modifier checks the claimant against GOLD status.
The IPrestige contract decides for itself whether the claimant is GOLD as at the current block.number
The claim can only be done once per account.




