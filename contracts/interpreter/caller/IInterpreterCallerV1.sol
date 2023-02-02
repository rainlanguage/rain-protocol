// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

/// @title IInterpreterCallerV1
/// @notice A contract that calls an `IInterpreterV1` via. `eval`. There are near
/// zero requirements on a caller other than:
///
/// - Provide the context, which can be built in a standard way by `LibContext`
/// - Handle the stack array returned from `eval`
/// - OPTIONALLY emit the `Context` event
/// - OPTIONALLY set state on the `IInterpreterStoreV1` returned from eval.
interface IInterpreterCallerV1 {
    /// Calling contracts SHOULD emit `Context` before calling `eval` if they
    /// are able. Notably `eval` MAY be called within a static call which means
    /// that events cannot be emitted, in which case this does not apply. It MAY
    /// NOT be useful to emit this multiple times for several eval calls if they
    /// all share a common context, in which case a single emit is sufficient.
    /// @param sender `msg.sender` building the context.
    /// @param context The context that was built.
    event Context(address sender, uint256[][] context);
}
