## `RightsManager`






### `constructRights(bool[] a) → struct RightsManager.Rights` (external)

create a struct from an array (or return defaults)


If you pass an empty array, it will construct it using the defaults


### `convertRights(struct RightsManager.Rights rights) → bool[]` (external)

Convert rights struct to an array (e.g., for events, GUI)


avoids multiple calls to hasPermission


### `hasPermission(struct RightsManager.Rights self, enum RightsManager.Permissions permission) → bool` (external)

Externally check permissions using the Enum





