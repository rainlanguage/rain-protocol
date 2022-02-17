// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

contract NoticeBoard {
    /// Anyone can emit a `Notice`.
    /// This is open ended content related to the subject.
    /// Some examples:
    /// - Raise descriptions/promises
    /// - Reviews/comments from token holders
    /// - Simple onchain voting/signalling
    /// GUIs/tooling/indexers reading this data are expected to know how to
    /// interpret it in context because the `NoticeBoard` contract does not.
    event Notice(
        /// The `msg.sender` that emitted the `Notice`.
        address sender,
        /// The subject of the `Notice`.
        address subject,
        /// Opaque binary data for the GUI/tooling/indexer to read.
        bytes data
    );

    /// Anyone can send a notice about the subject.
    /// The notice is opaque bytes. The indexer/GUI is expected to understand
    /// the context to decode/interpret it.
    /// @param subject_ The subject of the notice.
    /// @param data_ The data associated with this notice.
    function sendNotice(address subject_, bytes memory data_) external {
        emit Notice(msg.sender, subject_, data_);
    }
}