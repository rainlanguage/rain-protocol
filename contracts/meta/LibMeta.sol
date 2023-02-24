// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

/// @title LibMeta
/// @notice Rain encoding of metadata has the following design goals:
///
/// - Reinvent as little as possible, lean on existing standards
/// - Gas efficient enough to at least emit data as onchain events and
///   potentially even some scope for onchain reads
/// - Rich enough for complex offchain data processing
/// - Permissionlessly extensible as new encodings, content types, meta types,
///   serializations are invented and adopted
/// - Portable enough to not be coupled to a specific event type, could be
///   emitted anywhere by any contract, saved in a file, etc. and still be
///   standalone parseable
/// - Native support of unambiguous concatenations of a sequence of metas within
///   a single sequence of bytes
/// - Opt-in tooling support for various encodings and meta/content types
/// - Support a graph structure between meta such that meta can be about other
///   meta, e.g. to support community driven translations of content between
///   different human languages such as English and German
/// - Tooling can efficiently O(1) drop/ignore meta that it does not need or
///   support decoding and parsing for
///
/// # V1 Design.
///
/// Meta is binary data, the body of `bytes` in solidity but whatever binary
/// representation is appropriate elsewhere. E.g. the leading `uint256` length
/// from Solidity `bytes` is NOT considered part of the meta, nor are any other
/// representation concerns such as ABI encoding for inclusion in some onchain
/// event etc.
///
/// ## Self describing
///
/// Meta is a self describing document in two ways:
///
/// - The first 8 bytes MUST be the rain meta magic number
/// - The list of metas is represented as an RFC8742 cbor-seq of maps where each
///   map includes standard HTTP representation headers `Content-Type`,
///   `Content-Encoding`, and optionally `Content-Length`.
///   https://www.rfc-editor.org/rfc/rfc8742.html
///   https://developer.mozilla.org/en-US/docs/Glossary/Representation_header
///
/// ### Magic number
///
/// The magic number facilitates portability allowing tooling to identify with
/// high confidence that some data is intended to be interpreted as meta
/// regardless of where it may be emitted onchain in some event or found
/// elsewhere.
///
/// The magic number mimics ERC165 interface function signature calculation
/// using 8 bytes instead of 4 bytes for additional collision resistance. The
/// string used for the hashing is utf-8 `rain-meta-v1` and can be calculated as
/// ```
/// bytes8(keccak256(abi.encodePacked("rain-meta-v1")));
/// ```
///
/// Tooling that wishes to read meta MUST discard/ignore all binary data that
/// does not begin with the magic number.
///
/// ### RFC8742 CBOR sequence (uncompressed)
///
/// A CBOR sequence simply concatenates the raw binary bytes of each CBOR item
/// with no additional separators or other bytes. This is possible because each
/// CBOR item is unambiguous either because it has an explicit length or an
/// indefinite length followed by an explicit "break" byte. RFC8742 explains that
/// this property allows CBOR data to be directly concatentated within a binary
/// file, unlike e.g. JSON that is ambiguous and so requires additional
/// separators and processing logic to handle sequences correctly.
///
/// Typical usage
///
/// ### HTTP representation headers
///
/// A subset of HTTP representation headers are supported, specifically those
/// that are describe content rather than behaviour. E.g. `Content-Location` is
/// NOT supported because it describes how to retrieve data rather than how to
/// interpret it. Meta headers ONLY concern themselves with describing the
/// content itself as the inteded use is for the data to be made available either
/// onchain or from some other p2p system such as IPFS where the practicalities
/// of the system typically handle data integrity and availability concerns.
/// E.g. There is no danger that a CBOR seq will be truncated accidentally due to
/// some network failure as the block or IPFS hash itself provides cryptographic
/// proof of the data integrity.
///
/// As the HTTP header names are each quite long, weighing 12-16 bytes each, we
/// use single byte utf-8 aliases to each
///
/// Meta binary data is self describing using the same strings as HTTP headers
/// `Content-Encoding` and `Content-Type` to describe meta content. These strings
/// are governed by internet RFC standards and the IANA registry. They are
library LibMeta {
    function isRainMetaV1(bytes memory meta_) internal pure returns (bool) {
        uint256 mask_ = type(uint64).max;
        uint256 magicNumber_;
        assembly ("memory-safe") {
            magicNumber_ := and(mload(add(meta_, 8)), mask_)
        }
        return magicNumber_ == META_MAGIC_NUMBER_V1;
    }
}