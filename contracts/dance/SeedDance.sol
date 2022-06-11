// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../math/FixedPointMath.sol";

/// Represents a minimum and maximum duration for the dance in a structure that
/// can fit in a single slot. uint32 representation for timestamps is inline
/// with the rest of the rain protocol.
/// @param baseDuration Every participant will be able to reveal for at least
/// this amount of seconds after the start of the dance.
/// @param maxExtraTime The theoretical maximum number of additional seconds
/// above the baseDuration that an individual participant may reveal during. In
/// practical terms the seed is reallocating extra time randomly on this range
/// every time anyone reveals, so it is very unlikely that a given participant
/// will be able to utilise this maximum extra time.
struct TimeBound {
    uint32 baseDuration;
    uint32 maxExtraTime;
}

/// @title SeedDance
/// @notice A multiparty commit/reveal scheme designed to generate a shared
/// seed that impacts involved parties directly. For example, generating the
/// seed for a lottery/shuffle mechanic that maps NFT IDs to their metadata.
///
/// SeedDance does NOT implement any access or integrity checks (e.g. to ensure
/// that the correct `TimeBound` is passed to `_reveal`) as it is unopinionated
/// as to how inheriting contracts expose the dance to end users. Therefore it
/// is insecure by default, until the implementing contract carefully defines
/// participants and time bounds.
///
/// Assuming that interactive seed generation is an acceptible UX/workflow, the
/// main problem with commit/reveal schemes such as this is the "last actor"
/// weakness. Whoever is the last party to reveal the secret can see every
/// prior reveal, and knows the outcome of revealing their secret, so has an
/// outsized degree of control over the final result. The last actor can choose
/// if (can simply refuse to reveal) and when (dangerous if able to collude
/// with minter to manipulate results) they reveal.
///
/// Common mitigation strategies involve rewards for revealing and punishments
/// for not revealing. SeedDance makes some assumptions about how the seed is
/// to be generated and used, allowing it to focus on _fairness_ of outcome
/// rather than trying to avoid there being a last actor.
///
/// There WILL always be some last actor in every seed dance, but:
/// - Nobody can predict who the last actor is ahead of time
/// - It is difficult to predict who the last actor will be _during_ the dance
/// - Everyone is equally likely to be in the position of last actor
/// - Everyone chooses for themselves if/when to act, the order is not preset
/// - Anyone who can currently reveal during the dance may randomise all other
///   actor's ability to act
///
/// This is achieved by granting every address a random (up to a maximum)
/// additional duration during which they may reveal their secret. Only the
/// commiter of a secret may reveal it and have the shared secret updated, so
/// we can restrict the time window during which each agent may meaningfully
/// reveal the secret. Of course an agent may reveal a secret in a failed
/// transaction and then everyone will be able to see it, but it won't change
/// the seed. Every time a secret is revealed, it randomises everyone's time
/// windows, thus implicitly changing who MAY be the last actor. This random
/// shuffling MAY remove someone's ability to reveal that they previously had,
/// or grant the ability to reveal to someone who had previously timed out.
/// This mitigates the ability to manipulate the system by trying to be the
/// last actor in the following ways:
/// - The current last actor has only 1/N chance of being the last actor after
///   each reveal
/// - The longer the current last actor waits to reveal, the more likely it is
///   they will lose the ability to reveal at all the next time their window is
///   randomised, as they MAY be randomised to a time in the past
/// - The longer any actor waits to reveal, the more likely they are to be
///   front run on their reveal and have the subsequent shuffle rollback their
///   attempt to reveal (because other agents know their own secret and can see
///   the reveal in the mempool before it exists onchain)
/// - As the reveal times are frequently being shuffled it is much more
///   difficult for an agent to manipulate or censor a single or several blocks
///   as/with a miner/validator to manipulate the overall outcome of the dance
///
/// As there are no external or financial incentives required by the system,
/// the dance instead relies on "skin in the game". The addresses that are
/// allowed to commit secrets before the dance should only be those that are
/// DIRECTLY impacted by the outcome of the final seed. For example, in the NFT
/// mint/reveal workflow the dancers should be restricted to those addresses
/// that bought/minted NFT IDs and so are impacted by the metadata assignment.
/// By disallowing unaffected third parties it helps minimise the participation
/// of wallets who simply want to grief some address with no cost (besides gas)
/// to themselves.
///
/// Of course, as with all commit/reveal schemes, the secrets must be commited
/// before the dance starts and the reveal will fail if the secret provided
/// does not match the commitment. This prevents trivial manipulation of the
/// outcome by "revealing" arbitrary secrets designed to benefit the revealer.
///
/// The dance starts when `_start` is called. This is an internal function that
/// will fail if called more than once, but has no access controls by default.
/// There is no explicit end to the dance. The dance is complete when no more
/// agents will reveal their secret. This can only be observed once either all
/// secrets are revealed or all times have expired, but it MAY be effectively
/// true but impossible to measure when all parties are satisfied with the
/// outcome of the dance and so will choose not to reveal.
///
/// There is no requirement that everyone reveals their secrets and the choice
/// of initial seed is almost arbitrary. A block hash or similar can be used
/// as all participants may immediately reseed any initial seed that they are
/// not satisfied with. Even if a miner were to manipulate the starting seed it
/// would be very likely to be hashed into something else that the miner cannot
/// control or predict.
contract SeedDance {
    using FixedPointMath for uint256;

    /// The dance has started.
    /// @param sender `msg.sender` that started the dance.
    /// @param initialSeed The initial seed for the dance.
    event Start(address sender, bytes32 initialSeed);

    /// A new commitment is made.
    /// @param sender `msg.sender` that is committing a secret.
    /// @param commitment The cryptographic commitment (hash) for the secret.
    event Commit(address sender, bytes32 commitment);

    /// A secret has been revealed.
    /// @param sender `msg.sender` that has revealed their secret.
    /// @param secret The secret that was successfully revealed
    ///        i.e. it matched the commitment within the time bounds.
    /// @param newSeed The new shared seed resulting from hashing the revealed
    ///        secret with the old shared seed.
    event Reveal(address sender, bytes32 secret, bytes32 newSeed);

    /// The current shared seed that embodies all current revelead secrets from
    /// the dance. Will be initialized when `_start` is called and zero before.
    bytes32 internal _sharedSeed;

    /// The timestamp the dance was started at. Will be 0 before the dance has
    /// started.
    uint32 private _started;

    /// All AVAILABLE commitments from all addresses who called `_commit`.
    /// Each commitment is DELETED from storage when the owner calls `_reveal`.
    /// owner => secret
    mapping(address => bytes32) private _commitments;

    /// Require this function to only be callable before the dance has started.
    modifier onlyNotStarted() {
        require(block.timestamp < _started, "STARTED");
        _;
    }

    /// Start the dance. Can only happen once.
    /// Has no access control so the implementing contract must safeguard the
    /// workflow and decide when to start.
    /// @param initialSeed_ The seed to start the dance with. Either all
    ///        dancers will be satisfied and do nothing or it will be quickly
    ///        hashed into oblivion during the dance.
    function _start(bytes32 initialSeed_) internal onlyNotStarted {
        _started = uint32(block.timestamp);
        _sharedSeed = initialSeed_;
        emit Start(msg.sender, initialSeed_);
    }

    /// Before the dance starts anyone can commit a secret.
    /// Has no access control so if committers is to be a closed set it must be
    /// enforced by the implementing contract. The implementing contract SHOULD
    /// ensure that only users with "skin in the game" can commit secrets, to
    /// mitigate griefing strategies where sybils endlessly reseed at no cost
    /// to themselves.
    /// @param commitment_ The commitment (hash) for the secret that only
    /// `msg.sender` knows. MUST match the secret or the subsequent reveal will
    /// fail.
    function _commit(bytes32 commitment_) internal onlyNotStarted {
        require(_commitments[msg.sender] == 0, "COMMITMENT_EXISTS");
        _commitments[msg.sender] = commitment_;
        emit Commit(msg.sender, commitment_);
    }

    /// `msg.sender` reveals a valid secret, changing the shared secret and
    /// consuming their commitment.
    function _reveal(TimeBound memory timeBound_, bytes32 secret_) internal {
        require(
            block.timestamp <= canRevealUntil(timeBound_, msg.sender),
            "CANT_REVEAL"
        );
        bytes32 commitment_ = keccak256(abi.encodePacked(secret_));
        require(_commitments[msg.sender] == commitment_, "BAD_SECRET");
        delete _commitments[msg.sender];
        bytes32 newSharedSeed_ = keccak256(
            abi.encodePacked(_sharedSeed, secret_)
        );
        _sharedSeed = newSharedSeed_;
        emit Reveal(msg.sender, secret_, newSharedSeed_);
    }

    /// Every owner can reveal until some time but this time is different for
    /// every owner, and is reshuffled for every new shared secret.
    function canRevealUntil(TimeBound memory timeBound_, address owner_)
        public
        view
        returns (uint256 until_)
    {
        until_ = _started;
        if (until_ > 0) {
            unchecked {
                // Technically this means the duration will be [0, extra)
                // rather than (0, extra] because of the % but let's assume
                // nobody cares about the missing second enough to pay the gas
                // to calculate it.
                uint256 ownerExtraTime_ = uint256(
                    keccak256(abi.encodePacked(_sharedSeed, owner_))
                ) % timeBound_.maxExtraTime;
                until_ = _started + timeBound_.baseDuration + ownerExtraTime_;
            }
        }
    }
}
