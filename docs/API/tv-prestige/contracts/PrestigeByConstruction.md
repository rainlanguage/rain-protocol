## `PrestigeByConstruction`

Enforces prestige levels by contract contruction block.
The construction block is compared against the blocks returned by `statusReport`.
The `IPrestige` contract is paramaterised and set during construction.



### `onlyStatus(address account, enum IPrestige.Status status)`

Modifier that restricts access to functions depending on the status required by the function.

`isStatus` involves an external call to prestige.statusReport.
`require` happens AFTER the modified function to avoid rentrant `IPrestige` code.
Also `statusReport` from `IPrestige` is `view` so the compiler will error state modification.
https://consensys.github.io/smart-contract-best-practices/recommendations/#use-modifiers-only-for-checks

Do NOT use this to guard setting the status on an IPrestige contract.
The initial status would be checked AFTER it has already been modified which is unsafe.






### `constructor(contract IPrestige _prestige)` (public)





### `isStatus(address account, enum IPrestige.Status status) → bool` (public)

Check if an account has held AT LEAST the given status according to `prestige` since construction.
The account MUST have held the status continuously from construction until the "current" state according to `statusReport`.
Note that `statusReport` PROBABLY is current as at the block this function is called but MAYBE NOT.
The `IPrestige` contract is free to manage status reports however makes sense to it.






