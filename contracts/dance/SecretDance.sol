// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../math/FixedPointMath.sol";

struct ChaosBound {
    uint32 minDuration;
    uint32 maxDuration;
}

contract SecretDance {
    using FixedPointMath for uint256;

    event Start(address sender, bytes32 secret);

    event Commit(address sender, bytes32 commitment);

    event Reveal(address sender, bytes32 secret, bytes32 sharedSecret);

    bytes32 internal _sharedSecret;
    uint32 private _started;
    ChaosBound private _chaosBound;

    mapping(address => bytes32) private _commitments;

    modifier onlyNotStarted() {
        require(block.timestamp < _started, "STARTED");
        _;
    }

    function _start(bytes32 secret_) internal onlyNotStarted {
        _started = uint32(block.timestamp);
        _sharedSecret = secret_;
        emit Start(msg.sender, secret_);
    }

    function _commit(bytes32 commitment_) internal onlyNotStarted {
        require(_commitments[msg.sender] == 0, "COMMITMENT_EXISTS");
        _commitments[msg.sender] = commitment_;
        emit Commit(msg.sender, commitment_);
    }

    /// `msg.sender` reveals a valid secret, changing the shared secret.
    function _reveal(ChaosBound memory chaosBound_, bytes32 secret_) internal {
        require(
            block.timestamp <= canRevealUntil(chaosBound_, msg.sender),
            "CANT_REVEAL"
        );
        bytes32 commitment_ = keccak256(abi.encodePacked(secret_));
        require(_commitments[msg.sender] == commitment_, "BAD_SECRET");
        delete _commitments[msg.sender];
        bytes32 sharedSecret_ = keccak256(
            abi.encodePacked(_sharedSecret, secret_)
        );
        _sharedSecret = sharedSecret_;
        emit Reveal(msg.sender, secret_, sharedSecret_);
    }

    /// Every owner can reveal until some time but this time is different for
    /// every owner, and is reshuffled for every new shared secret.
    function canRevealUntil(ChaosBound memory chaosBound_, address owner_)
        public
        view
        returns (uint256 until_)
    {
        until_ = _started;
        if (until_ > 0) {
            // Checked math here to ensure max >= min.
            uint256 diff_ = chaosBound_.maxDuration - chaosBound_.minDuration;
            unchecked {
                until_ =
                    _started +
                    chaosBound_.minDuration +
                    diff_
                        .scale18(0)
                        .fixedPointMul(
                            uint256(
                                keccak256(
                                    abi.encodePacked(_sharedSecret, owner_)
                                )
                            ) % FP_ONE
                        )
                        .scaleN(0);
            }
        }
    }
}
