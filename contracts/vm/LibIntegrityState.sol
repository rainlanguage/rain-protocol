// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "./RainVM.sol";
import "./LibStackTop.sol";

struct IntegrityState {
    bytes[] ptrSources;
    StorageOpcodesRange storageOpcodesRange;
    StackTop stackBottom;
    StackTop stackLength;
}