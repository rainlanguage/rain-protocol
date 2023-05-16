// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ReserveToken18} from "../testToken/ReserveToken18.sol";
import {Lobby, PHASE_PLAYERS_PENDING, PHASE_RESULT_PENDING, PHASE_COMPLETE, PHASE_INVALID} from "../../lobby/Lobby.sol";
import {SignedContextV1} from "rain.interface.interpreter/IInterpreterCallerV2.sol";
import "hardhat/console.sol";

contract LobbyReentrantSender is ReserveToken18 {
    Lobby private lobby;

    uint256[] private callerContext;
    SignedContextV1[] private signedContexts;

    constructor() ReserveToken18() {}

    function addReentrantTarget(
        Lobby lobby_,
        uint256[] memory callerContext_,
        SignedContextV1[] memory signedContexts_
    ) external {
        lobby = lobby_;
        callerContext = callerContext_;
        signedContexts_ = signedContexts_;
    }

    /// @inheritdoc ReserveToken18
    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);
        if (sender_ != address(0) && sender_ == address(lobby)) {
            if (lobby.currentPhase() == PHASE_INVALID) {
                // This call MUST fail.
                lobby.refund();
            } else if (lobby.currentPhase() == PHASE_PLAYERS_PENDING) {
                // The subsequent calls MUST fail.
                lobby.join(callerContext, signedContexts);
                lobby.leave(callerContext, signedContexts);
            } else if (
                lobby.currentPhase() == PHASE_RESULT_PENDING ||
                lobby.currentPhase() == PHASE_COMPLETE
            ) {
                // This call MUST fail.
                lobby.claim(callerContext, signedContexts);
            }
        }
    }
}
