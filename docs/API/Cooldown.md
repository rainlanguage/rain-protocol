## `Cooldown`





### `onlyAfterCooldown()`

Modifies a function to enforce the cooldown for `msg.sender`.
Saves the original caller so that cooldowns are enforced across
reentrant code.




### `constructor(uint16 cooldownDuration_)` (public)

The cooldown duration is global to the contract.
Cooldown duration must be greater than 0.





