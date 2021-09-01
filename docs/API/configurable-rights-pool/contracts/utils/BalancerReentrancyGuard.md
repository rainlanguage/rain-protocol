## `BalancerReentrancyGuard`



Contract module that helps prevent reentrant calls to a function.

Inheriting from `ReentrancyGuard` will make the {_lock_} modifier
available, which can be applied to functions to make sure there are no nested
(reentrant) calls to them.

Note that because there is a single `_lock_` guard, functions marked as
`_lock_` may not call one another. This can be worked around by making
those functions `private`, and then adding `external` `_lock_` entry
points to them.

Also adds a _lockview_ modifier, which doesn't create a lock, but fails
  if another _lock_ call is in progress

### `lock()`



Prevents a contract from calling itself, directly or indirectly.
Calling a `_lock_` function from another `_lock_`
function is not supported. It is possible to prevent this from happening
by making the `_lock_` function external, and make it call a
`private` function that does the actual work.

### `viewlock()`



Also add a modifier that doesn't create a lock, but protects functions that
     should not be called while a _lock_ function is running


### `constructor()` (internal)






