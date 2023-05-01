// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ReserveToken18} from "../testToken/ReserveToken18.sol";
import {Lobby, PHASE_PLAYERS_PENDING, PHASE_RESULT_PENDING, PHASE_COMPLETE, PHASE_INVALID} from "../../lobby/Lobby.sol";
import {SignedContextV1} from "rain.interface.interpreter/IInterpreterCallerV2.sol";
import "hardhat/console.sol";

contract LobbyReentrantReceiver is ReserveToken18 {
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
        if (receiver_ != address(0) && receiver_ == address(lobby)) {
            // This call MUST fail.
            lobby.join(callerContext, signedContexts);
        }
    }
}
