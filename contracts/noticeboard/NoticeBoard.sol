// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

struct Notice {
    address subject;
    bytes data;
}

contract NoticeBoard {
    uint256 private nextId;
    /// Anyone can emit a `Notice`.
    /// This is open ended content related to the subject.
    /// Some examples:
    /// - Raise descriptions/promises
    /// - Reviews/comments from token holders
    /// - Simple onchain voting/signalling
    /// GUIs/tooling/indexers reading this data are expected to know how to
    /// interpret it in context because the `NoticeBoard` contract does not.
    event NewNotice(
        /// The `msg.sender` that emitted the `Notice`.
        address sender,
        /// The id of the event.
        uint256 id,
        /// The notice data.
        Notice notice
    );

    /// Anyone can create notices about some subject.
    /// The notice is opaque bytes. The indexer/GUI is expected to understand
    /// the context to decode/interpret it.
    /// @param notices_ All the notices to emit.
    function createNotices(Notice[] calldata notices_) external {
        uint256 id_ = nextId;
        for (uint256 i_ = 0; i_ < notices_.length; i_++) {
            emit NewNotice(msg.sender, id_, notices_[i_]);
            id_++;
        }
        nextId = id_;
    }
}
