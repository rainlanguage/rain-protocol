// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

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

type Seed is uint256;
type Secret is uint256;
type Commitment is uint256;

library LibSeed {
    /// Generates a new unpredictable, cryptographic strength seed by hashing
    /// an existing seed with some value. All values used to build the new seed
    /// are equally valid due to hashing guarantees but of course same seed and
    /// value will give the same output. That is to say, `with` is entirely
    /// deterministic for any given inputs. In this context "unpredictable"
    /// means, "unpredictable provided you don't know both seed and val".
    /// @param seed_ An existing seed.
    /// @param val_ Can be literally any uint256 as the hashing will ensure the
    /// returned seed is unpredictable.
    /// @return newSeed_ The result of applying `val_` to `seed_`.
    function with(Seed seed_, uint256 val_) internal pure returns (Seed) {
        return Seed.wrap(uint256(keccak256(abi.encodePacked(seed_, val_))));
    }
}

library LibCommitment {
    /// Equality check for commitments.
    /// @param a_ First commitment to compare.
    /// @param b_ Second commitment to compare.
    /// @return eq_ True if a_ equals b_, else false.
    function eq(Commitment a_, Commitment b_) internal pure returns (bool) {
        return Commitment.unwrap(a_) == Commitment.unwrap(b_);
    }

    /// Build the commitment for a secret.
    /// Standard commitment build is by hashing the secret as bytes.
    /// DO NOT EXPOSE THIS ONCHAIN. Replicate the functionality offchain so it
    /// can and WILL be run locally to the secret generation process.
    /// It is far too difficult to ensure that secrets will stay secret if
    /// users are expected to be forwarding them around to RPCs etc. just to
    /// find the value of their commitments.
    /// DO NOT SEND SECRETS ANYWHERE, LEAVE THEM WHERE YOU MADE THEM.
    /// DO NOT REUSE SECRETS, GENERATE A NEW ONE FOR EVERY COMMITMENT.
    /// Of course, you MAY send a secret if and only if it is being revealed as
    /// part of a dance.
    function fromSecret(Secret secret_) internal pure returns (Commitment) {
        return Commitment.wrap(uint256(keccak256(abi.encodePacked(secret_))));
    }

    /// The nil valued commitment.
    /// No secret can match this commitment, or at least probably nobody knows
    /// the secret that does match this commitment.
    /// @return nil_ Nil valued commitment.
    function nil() internal pure returns (Commitment) {
        return Commitment.wrap(0);
    }
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
/// Note that as the secret is broadcast to the mempool as soon as reveal is
/// called, all other participants MAY front run the reveal in an attempt to
/// grief that reveal. Similarly miners can reorg or exclude any
/// reveal within a single block arbitrarily. While this likely will
/// disadvantage the greifee it will still result in at least one global reseed
/// and the greifer will consume their secret and commitment in the process.
/// Subsequently some other seeder MAY roll the seed again in a way that
/// allows the griefee access to the dance once more, but the griefer will have
/// used their secret and so cannot attack a second time.
///
/// It is entirely that cartels form attempting to reseed the dance in their
/// favour. In this case the best defense is a statistical one, for example an
/// NFT project can engineer their rarities such that a large cartel implies a
/// large sample size, so each reseed becomes increasingly boring as the cartel
/// grows, thus undermining the advantage of having a cartel in the first place.
/// This can work as statistically the chance of achieving an average outcome
/// increases as the number of samples (members of the cartel) increases.
///
/// However, a griefing cartel MAY form with the sole goal to prevent a single
/// or small number of addresses from acheiving a desirable outcome. In this
/// case the attack MAY succeed if the cartel represents a large percentage of
/// the dancers, but it still only requires a single reseed after the cartel
/// performs its actions to completely negate all cartel actions. There is no
/// specific defense against this kind of attack, other than to hope the chaos
/// of the dance thwarts the cartel in the moment. One must ask why a cartel
/// would form (which involves e.g. mass minting/buying NFTs) in the first
/// place merely to perform a DOS style attack on a single wallet. It MAY
/// happen sometime, but we expect it is unlikely to be a common occurance.
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
    using LibCommitment for Commitment;

    /// The dance has started.
    /// @param sender `msg.sender` that started the dance.
    /// @param initialSeed The initial seed for the dance.
    event Start(address sender, Seed initialSeed);

    /// A new commitment is made.
    /// @param sender `msg.sender` that is committing a secret.
    /// @param commitment The cryptographic commitment (hash) for the secret.
    event Commit(address sender, Commitment commitment);

    /// A secret has been revealed.
    /// @param sender `msg.sender` that has revealed their secret.
    /// @param secret The secret that was successfully revealed
    /// i.e. it matched the commitment within the time bounds.
    /// @param newSeed The new shared seed resulting from hashing the revealed
    /// secret with the old shared seed.
    event Reveal(address sender, Secret secret, Seed newSeed);

    /// The current shared seed that embodies all current revealed secrets from
    /// the dance. Will be initialized when `_start` is called and zero before.
    Seed internal _sharedSeed;

    /// The timestamp the dance was started at. Will be 0 before the dance has
    /// started.
    uint32 private _startedAt;

    /// All AVAILABLE commitments from all addresses who called `_commit`.
    /// Each commitment is DELETED from storage when the owner calls `_reveal`.
    /// owner => secret
    mapping(address => Commitment) private _commitments;

    /// Require this function to only be callable before the dance has started.
    modifier onlyNotStarted() {
        if (_startedAt > 0) {
            require(block.timestamp < _startedAt, "STARTED");
        }
        _;
    }

    /// Start the dance. Can only happen once.
    /// Has no access control so the implementing contract must safeguard the
    /// workflow and decide when to start.
    /// @param initialSeed_ The seed to start the dance with. Either all
    /// dancers will be satisfied and do nothing or it will be quickly hashed
    /// into oblivion during the dance.
    function _start(Seed initialSeed_) internal onlyNotStarted {
        // Initialize the dance.
        _startedAt = uint32(block.timestamp);
        _sharedSeed = initialSeed_;

        // Tell the world.
        emit Start(msg.sender, initialSeed_);
    }

    /// Before the dance starts anyone can commit a secret.
    /// Has no access control so if committers is to be a closed set it must be
    /// enforced by the implementing contract. The implementing contract SHOULD
    /// ensure that only users with "skin in the game" can commit secrets, to
    /// mitigate griefing strategies where sybils endlessly reseed at no cost
    /// to themselves.
    /// Users are free to commit as many times as they like prior to the dance
    /// starting, which will overwrite previous commitments rending them
    /// unusable during the dance. Once the dance starts no further additions
    /// or changes to commitments can be made.
    /// @param commitment_ The commitment (hash) for the secret that only
    /// `msg.sender` knows. MUST match the secret or the subsequent reveal will
    /// fail.
    function _commit(Commitment commitment_) internal onlyNotStarted {
        // Store the commitment over whatever was there before.
        _commitments[msg.sender] = commitment_;

        // Tell the world.
        emit Commit(msg.sender, commitment_);
    }

    /// `msg.sender` reveals a valid secret, changing the shared seed and
    /// consuming their commitment. To successfully reveal the sender MUST
    /// complete the reveal within their personal time as defined by the
    /// provided time bounds and current shared seed.
    /// The implementing contract MUST ensure the validity of the time bounds
    /// being passed in and any additional access controls for reveals.
    /// Each secret can only be revealed once as the commitment will be deleted
    /// after the first reveal per-secret.
    /// Users can ONLY reveal their own commitments BUT their secret will be
    /// publicly visible as soon as the transaction hits the mempool, so they
    /// SHOULD NOT attempt a reveal if they believe the transaction will fail,
    /// including due to being front run by other reveals reshuffling times.
    /// @param timeBound_ The time bounds to check for the reveal. These are
    /// NOT checked for validity so the caller MUST NOT trust user provided
    /// bounds without verifying them.
    /// @param secret_ The secret revealed by the user. MUST be revealed
    /// within the user's personal time and match their prior commitment. MUST
    /// be 32 bytes as we want to discourage predictable secrets and
    /// unnecessarily long secrets.
    function _reveal(TimeBound memory timeBound_, Secret secret_) internal {
        // Enforce individual time constraints.
        require(
            block.timestamp <=
                canRevealUntil(_sharedSeed, _startedAt, timeBound_, msg.sender),
            "CANT_REVEAL"
        );

        // This will fail if the commitment was already consumed, we don't
        // need an additional check for that case.
        require(
            _commitments[msg.sender].eq(LibCommitment.fromSecret(secret_)),
            "BAD_SECRET"
        );
        // Clear out commitment so it can't be used again for the same seed.
        // Also a lil' gas refund.
        _commitments[msg.sender] = LibCommitment.nil();

        // Build the new shared seed.
        Seed newSeed_ = LibSeed.with(_sharedSeed, Secret.unwrap(secret_));
        _sharedSeed = newSeed_;

        // Notify the world.
        emit Reveal(msg.sender, secret_, newSeed_);
    }

    /// Every owner can reveal until some time but this time is different for
    /// every owner, and is reshuffled for every new shared secret.
    /// @param seed_ The seed to calculate the final timestamp from. Will be
    /// the shared seed when called from within `_reveal`.
    /// @param start_ The start timestamp to calculate the final timestamp
    /// relative to. Will be `_startedAt` when called from within `_reveal`. If
    /// start_ is 0 then the returned `until_` will always be 0.
    /// @param timeBound_ The time bounds to check for the hypothetical reveal.
    /// This is not checked for validity so it is the responsibility of the
    /// caller to ensure the bounds are correct or the return value will be
    /// incorrect.
    /// @param owner_ Owner of the secret that would hypothetically be revealed.
    /// @return until_ The last second that the the owner can reveal, given all
    /// the above parameters. Note that in real usage the above parameters can
    /// change very quickly and unpredictably, including multiple times in a
    /// single block. Even if a user checks their reveal time before calling
    /// `_reveal`, they MAY be front run by another reveal that negates their
    /// ability to reveal, potentially permanently. If `start_` is 0 then the
    /// returned `until_` will always be 0.
    function canRevealUntil(
        Seed seed_,
        uint256 start_,
        TimeBound memory timeBound_,
        address owner_
    ) public pure returns (uint256 until_) {
        unchecked {
            // Default is to just return 0.
            until_ = start_;

            // If it isn't 0 then we've started so add the relevant duration.
            if (until_ > 0) {
                // Technically this means the duration will be [0, extra)
                // rather than (0, extra] because of the % but let's assume
                // nobody cares about the missing second enough to pay the gas
                // to calculate it.
                uint256 ownerExtraTime_ = Seed.unwrap(
                    LibSeed.with(seed_, uint256(uint160(owner_)))
                ) % timeBound_.maxExtraTime;
                until_ += timeBound_.baseDuration + ownerExtraTime_;
            }
        }
    }
}
