// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

struct Rights {
    bool canPauseSwapping;
    bool canChangeSwapFee;
    bool canChangeWeights;
    bool canAddRemoveTokens;
    bool canWhitelistLPs;
    bool canChangeCap;
}