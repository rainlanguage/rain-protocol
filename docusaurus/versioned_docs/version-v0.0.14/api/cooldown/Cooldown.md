`Cooldown` is an abstract contract that rate limits functions on
the contract per `msg.sender`.

Each time a function with the `onlyAfterCooldown` modifier is called the
`msg.sender` must wait N blocks before calling any modified function.

This does nothing to prevent sybils who can generate an arbitrary number of
`msg.sender` values in parallel to spam a contract.

`Cooldown` is intended to prevent rapid state cycling to grief a contract,
such as rapidly locking and unlocking a large amount of capital in the
`SeedERC20` contract.

Requiring a lock/deposit of significant economic stake that sybils will not
have access to AND applying a cooldown IS a sybil mitigation. The economic
stake alone is NOT sufficient if gas is cheap as sybils can cycle the same
stake between each other. The cooldown alone is NOT sufficient as many
sybils can be created, each as a new `msg.sender`.



## Details
Base for anything that enforces a cooldown delay on functions.
Cooldown requires a minimum time in blocks to elapse between actions that
cooldown. The modifier `onlyAfterCooldown` both enforces and triggers the
cooldown. There is a single cooldown across all functions per-contract
so any function call that requires a cooldown will also trigger it for
all other functions.

Cooldown is NOT an effective sybil resistance alone, as the cooldown is
per-address only. It is always possible for many accounts to be created
to spam a contract with dust in parallel.
Cooldown is useful to stop a single account rapidly cycling contract
state in a way that can be disruptive to peers. Cooldown works best when
coupled with economic stake associated with each state change so that
peers must lock capital during the cooldown. Cooldown tracks the first
`msg.sender` it sees for a call stack so cooldowns are enforced across
reentrant code.

## Variables
### `uint16` `cooldownDuration`

### `mapping(address => uint256)` `cooldowns`



## Modifiers
### `onlyAfterCooldown()`

Modifies a function to enforce the cooldown for `msg.sender`.
Saves the original caller so that cooldowns are enforced across
reentrant code.




## Functions
### `constructor(uint16 cooldownDuration_)` (public)

The cooldown duration is global to the contract.
Cooldown duration must be greater than 0.




