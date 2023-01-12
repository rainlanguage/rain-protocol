// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../array/LibUint256Array.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/IInterpreterV1.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibStackPointer.sol";
import "../interpreter/run/LibContext.sol";
import "../interpreter/run/IInterpreterCallerV1.sol";
import "../math/SaturatingMath.sol";
import "../math/FixedPointMath.sol";

import "../phased/Phased.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// Configuration for a `Lobby` to initialize.
/// @param refMustAgree If `true` the ref must agree to be the ref before ANY
/// players can join. This guards against the ref being entirely unaware of the
/// lobby and therefore unlikely to sign any data beyond generic results. This
/// MAY be `false` if the outcome of the `Lobby` can be inferred by entirely
/// generic data that the ref is likely to publish regardless of the `Lobby`,
/// such as a winner list that can be produced upon demand from some API.
/// @param ref The ref is some address that is expected to provide signatures of
/// the results that allow the `Lobby` to complete or move to invalid.
struct LobbyConfig {
    bool refMustAgree;
    address ref;
    address expressionDeployer;
    address interpreter;
    address token;
    StateConfig stateConfig;
    // ipfs hash or similar of description and rules etc. that can be in json
    // for GUI.
    bytes description;
    // timeout the whole lobby after this many seconds.
    uint256 timeoutDuration;
}

/// @dev A player is attempting to join.
/// This expression is responsible for:
/// - Any access gating using `ensure` to error ineligible players
/// - Calculating an amount of the token buyin
/// - Starting the event by returning 0 or 1+ as truthy value
/// Future versions could support multi-token buyins
SourceIndex constant ENTRYPOINT_JOIN = SourceIndex.wrap(0);

/// @dev A player is attempting to leave.
/// This expression is responsible for:
/// - Enforcing cooldowns and other reasons a player cannot leave
/// - Calculating an amount to refund (will be capped by Lobby to their initial deposit)
/// Expression has access to the player's initial deposit in context so can use it
/// for
SourceIndex constant ENTRYPOINT_LEAVE = SourceIndex.wrap(1);

/// @dev A claim is being processed.
/// This expression is responsible for:
/// - Calculating pro rata shares of the caller, can include ref fees etc.
/// - Ensuring the sanity of the results provided by the ref as claim will be
///   called as the event is completing.
/// The expression MAY revert for invalid results but should return 0 for any
/// caller that is merely not entitled to claim tokens.
SourceIndex constant ENTRYPOINT_CLAIM = SourceIndex.wrap(2);

/// @dev The ref has declared an invalid result, or there is some other reason
/// the `Lobby` is invalid. The expression DOES NOT have to cover the case of
/// the ref failing to sign anything at all as this will be handled by the
/// hardcoded timeout value.
SourceIndex constant ENTRYPOINT_INVALID = SourceIndex.wrap(3);

/// @dev Need a truthy value to start the event and an amount (can be 0) for join
/// deposits.
uint256 constant JOIN_MIN_OUTPUTS = 2;
uint256 constant JOIN_MAX_OUTPUTS = 2;

// Only need an amount (can be 0) for leave refunds.
uint256 constant LEAVE_MIN_OUTPUTS = 1;
uint256 constant LEAVE_MAX_OUTPUTS = 2;

// Need the share for a claim.
uint256 constant CLAIM_MIN_OUTPUTS = 1;
uint256 constant CLAIM_MAX_OUTPUTS = 1;

uint256 constant INVALID_MIN_OUTPUTS = 1;
uint256 constant INVALID_MAX_OUTPUTS = 1;

// Event is waiting for the ref to agree to ref.
uint256 constant PHASE_REF_PENDING = 0;
// Event is waiting for players to join.
uint256 constant PHASE_PLAYERS_PENDING = 1;
// Event has started and is waiting a result from the ref.
uint256 constant PHASE_RESULT_PENDING = 2;
// Event is complete with a result from the ref.
uint256 constant PHASE_COMPLETE = 3;
// Event is invalid which entitles everyone _who did not already leave_ a 1:1
// refund on their deposit.
uint256 constant PHASE_INVALID = 4;

// Phased is a contract in the rain repo that allows contracts to move sequentially
// through phases and restrict logic by phase.
contract Lobby is Phased, ReentrancyGuard, IInterpreterCallerV1 {
    using SafeERC20 for IERC20;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using Math for uint256;
    using SaturatingMath for uint256;
    using FixedPointMath for uint256;

    event Initialize(address sender, LobbyConfig config);

    event Deposit(address sender, address token, uint256 amount);

    event Join(address sender);

    event Leave(address sender, address token, uint256 deposit, uint256 amount);

    event PlayersFinalised(address sender);

    /// Emitted when a refund is processed for `msg.sender` MAY be less than the
    /// original deposit if the `leave` expression reduces it. MAY NOT be greater
    /// than the original deposit.
    /// @param sender `msg.sender` that the refund is processed for.
    event Refund(address sender, uint256 amount);

    event Claim(address sender, uint256 share, uint256 amount);

    /// Emitted when a `Lobby` is declared invalid by a ref or some other
    /// condition such as the timeout being reached.
    event Invalid(
        address sender,
        uint256[] callerContext,
        SignedContext[] signedContext
    );

    uint256 internal immutable maxTimeoutDuration;
    uint256 internal timeoutAt;

    bytes32 internal resultHash;

    address internal ref;
    IERC20 internal token;
    IInterpreterV1 internal interpreter;

    address internal expression;

    mapping(address => uint256) internal players;
    mapping(address => uint256) internal deposits;
    uint256 internal totalDeposited;
    mapping(address => uint256) internal shares;
    uint256 internal totalShares;
    mapping(address => uint256) internal withdrawals;

    /// A max timeout is enforced in the constructor so that all cloned proxies
    /// share it, which prevents an initiator from setting a far future timeout
    /// and effectively disabling it to trap funds.
    constructor(uint256 maxTimeoutDuration_) {
        maxTimeoutDuration = maxTimeoutDuration_;
    }

    function initialize(LobbyConfig calldata config_) external initializer {
        // anon initializes with the passed config
        // we initialize rather than construct as there would be some factory
        // producing cheap clones of an implementation contract

        initializePhased();
        __ReentrancyGuard_init();

        // immediately move to pending player phase if ref doesn't need to agree
        if (!config_.refMustAgree) {
            schedulePhase(PHASE_PLAYERS_PENDING, block.timestamp);
        }

        require(config_.timeoutDuration <= maxTimeoutDuration, "MAX_TIMEOUT");
        timeoutAt = block.timestamp + config_.timeoutDuration;

        // This deploys the expression data, we specify the min return values for
        // each entrypoint by index, the deployer will dry run the expression and
        // confirm at least the number of specified outputs will be returned.
        expression = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.stateConfig,
                LibUint256Array.arrayFrom(
                    JOIN_MIN_OUTPUTS,
                    LEAVE_MIN_OUTPUTS,
                    CLAIM_MIN_OUTPUTS
                )
            );

        ref = config_.ref;
        token = IERC20(config_.token);
        interpreter = IInterpreterV1(config_.interpreter);

        emit Initialize(msg.sender, config_);
    }

    function _joinEncodedDispatch() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                ENTRYPOINT_JOIN,
                JOIN_MAX_OUTPUTS
            );
    }

    function _leaveEncodedDispatch() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                ENTRYPOINT_LEAVE,
                LEAVE_MAX_OUTPUTS
            );
    }

    function _claimEncodedDispatch() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                ENTRYPOINT_CLAIM,
                CLAIM_MAX_OUTPUTS
            );
    }

    function _invalidEncodedDispatch() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                ENTRYPOINT_INVALID,
                INVALID_MAX_OUTPUTS
            );
    }

    /// Enforces that only the ref can call the modified function.
    modifier onlyRef() {
        require(msg.sender == ref, "ONLY_REF");
        _;
    }

    /// Enforces that anyone other than the ref can call the modified function.
    modifier onlyNonRef() {
        require(msg.sender != ref, "ONLY_NON_REF");
        _;
    }

    /// Enforces that only players who joined can call the modified function.
    modifier onlyPlayer() {
        require(players[msg.sender] > 0, "ONLY_PLAYER");
        _;
    }

    /// Enforces that only non-players can call the modified function.
    modifier onlyNonPlayer() {
        require(players[msg.sender] == 0, "ONLY_NON_PLAYER");
        _;
    }

    /// Allow the ref to agree to the lobby.
    /// This is optionally required by the init config.
    /// If it is required then players cannot join until this is called.
    function refAgrees() external onlyRef onlyPhase(PHASE_REF_PENDING) {
        schedulePhase(PHASE_PLAYERS_PENDING, block.timestamp);
    }

    function _deposit(uint256 amount_) internal {
        deposits[msg.sender] = amount_;
        totalDeposited += amount_;
        token.safeTransferFrom(msg.sender, address(this), amount_);
        emit Deposit(msg.sender, address(token), amount_);
    }

    // At any time anyone can deposit without joining or leaving.
    // This will become available to claimants.
    function deposit(uint256 amount_) external nonReentrant {
        _deposit(amount_);
    }

    function join(
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    )
        external
        onlyPhase(PHASE_PLAYERS_PENDING)
        onlyNonPlayer
        onlyNonRef
        nonReentrant
    {
        unchecked {
            IInterpreterV1 interpreter_ = interpreter;
            uint256[][] memory context_ = LibContext.build(
                new uint256[][](0),
                callerContext_,
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                uint256[] memory stack_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = interpreter_.eval(
                    DEFAULT_STATE_NAMESPACE,
                    _joinEncodedDispatch(),
                    context_
                );
            uint256 playersFinalised_ = stack_[stack_.length - 2];
            uint256 amount_ = stack_[stack_.length - 1];

            players[msg.sender] = 1;
            store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
            _deposit(amount_);

            emit Join(msg.sender);

            // Atomically finalise the player list with the player joining.
            if (playersFinalised_ > 0) {
                schedulePhase(PHASE_RESULT_PENDING, block.timestamp);
                emit PlayersFinalised(msg.sender);
            }
        }
    }

    function leave(
        uint256[] memory callerContext_,
        SignedContext[] memory signedContext_
    ) external onlyPhase(PHASE_PLAYERS_PENDING) onlyPlayer nonReentrant {
        players[msg.sender] = 0;
        uint256 deposit_ = deposits[msg.sender];

        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContext_
        );
        emit Context(msg.sender, context_);
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = IInterpreterV1(interpreter).eval(
                DEFAULT_STATE_NAMESPACE,
                _leaveEncodedDispatch(),
                context_
            );
        // Use the smaller of the interpreter amount and the player's original
        // deposit as the amount they will be refunded.
        uint256 amount_ = stack_.asStackPointerAfter().peek().min(deposit_);
        // the calculated amount is refunded and their entire deposit forfeited
        // from the internal ledger.
        IERC20(token).safeTransfer(msg.sender, amount_);
        deposits[msg.sender] = 0;
        totalDeposited -= amount_;
        store_.set(DEFAULT_STATE_NAMESPACE, kvs_);

        emit Leave(msg.sender, address(token), deposit_, amount_);
    }

    function claim(
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    )
        external
        onlyAtLeastPhase(PHASE_RESULT_PENDING)
        onlyNotPhase(PHASE_INVALID)
        nonReentrant
    {
        bytes32 signedContextsHash_ = LibContext.hash(signedContexts_);

        // The first time claim is called we move to complete and register the
        // hash of the signed context used to phase shift.
        if (currentPhase() == PHASE_RESULT_PENDING) {
            require(resultHash == 0, "HASH_SET");
            resultHash = signedContextsHash_;
            schedulePhase(PHASE_COMPLETE, block.timestamp);
        }

        if (currentPhase() != PHASE_COMPLETE) {
            revert BadPhase();
        }

        require(resultHash == signedContextsHash_, "BAD_HASH");

        // Calculating a claimant's share is a 1 time thing. Dynamic shares aren't
        // supported, the expression MUST ensure that each user has a stable share
        // and that all shares add up to 1 across all claimants.
        if (shares[msg.sender] == 0) {
            uint256[][] memory context_ = LibContext.build(
                new uint256[][](0),
                callerContext_,
                signedContexts_
            );
            emit Context(msg.sender, context_);
            (
                uint256[] memory stack_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = interpreter.eval(
                    DEFAULT_STATE_NAMESPACE,
                    _claimEncodedDispatch(),
                    context_
                );
            // Share for this claimant is the smaller of the calculated share and
            // 1 - shares already claimed.
            unchecked {
                uint256 claimantShares_ = stack_[stack_.length - 1].min(
                    uint256(1e18).saturatingSub(totalShares)
                );
                totalShares += claimantShares_;
                shares[msg.sender] = claimantShares_;
            }
            if (kvs_.length > 0) {
                store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
            }
        }

        // Send caller their prorata share of total deposits to date and log the
        // withdrawal so they cannot double-claim. If future deposits are made
        // they will be eligible to claim their prorata share of the future
        // deposits.
        if (shares[msg.sender] > 0) {
            uint256 amount_ = (totalDeposited - withdrawals[msg.sender])
                .fixedPointMul(shares[msg.sender])
                .min(
                    // Guard against rounding issues locking funds.
                    token.balanceOf(address(this))
                );
            token.safeTransfer(msg.sender, amount_);
            withdrawals[msg.sender] = totalDeposited;
            emit Claim(msg.sender, shares[msg.sender], amount_);
        }
    }

    function isInvalid(
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) internal returns (bool) {
        // Timeouts ALWAYS allow an invalid result, unless the lobby is complete.
        // This guards against the expressions themselves being buggy and/or the
        // ref never signing a usable result. This MUST short circuit the logic
        // below to guard against the invalid entrypoint itself somehow breaking.
        if (block.timestamp > timeoutAt) {
            return true;
        }

        IInterpreterV1 interpreter_ = interpreter;
        uint256[][] memory context_ = LibContext.build(
            new uint256[][](0),
            callerContext_,
            signedContexts_
        );
        emit Context(msg.sender, context_);
        (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) = interpreter_.eval(
                DEFAULT_STATE_NAMESPACE,
                _invalidEncodedDispatch(),
                context_
            );

        if (kvs_.length > 0) {
            store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
        }

        unchecked {
            return stack_[stack_.length - 1] > 0;
        }
    }

    function invalid(
        uint256[] memory callerContext_,
        SignedContext[] memory signedContexts_
    ) external onlyNotPhase(PHASE_COMPLETE) {
        // It is NOT possible to rollback a prior completion. Complete/invalid
        // are mutually exclusive states because they imply incompatible token
        // allocations for withdrawal, which would lead to a bank run and/or
        // locked tockens in the contract.
        // Note that the logic below will move the Lobby _through_ the complete
        // phase to the invalid phase, but this happens atomically within this
        // function call so there's no way that `claim` can be called before
        // `refund` is enabled.
        require(isInvalid(callerContext_, signedContexts_), "NOT_INVALID");

        // Fast forward all phases to invalid.
        while (currentPhase() < PHASE_INVALID) {
            schedulePhase(currentPhase() + 1, block.timestamp);
        }
        emit Invalid(msg.sender, callerContext_, signedContexts_);
    }

    function refund() external onlyPhase(PHASE_INVALID) {
        uint256 amount_ = deposits[msg.sender];
        token.safeTransfer(msg.sender, amount_);
        deposits[msg.sender] = 0;
        emit Refund(msg.sender, amount_);
    }
}
