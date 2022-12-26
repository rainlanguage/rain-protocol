// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IVerifyCallbackV1.sol";

import {AccessControlUpgradeable as AccessControl} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./libraries/VerifyConstants.sol";
import "./LibEvidence.sol";
import "../array/LibUint256Array.sol";
import "./IVerifyV1.sol";
import "./libraries/LibVerifyStatus.sol";

/// Records the time a verify session reaches each status.
/// If a status is not reached it is left as UNINITIALIZED, i.e. 0xFFFFFFFF.
/// Most accounts will never be banned so most accounts will never reach every
/// status, which is a good thing.
/// @param addedSince Time the address was added else 0xFFFFFFFF.
/// @param approvedSince Time the address was approved else 0xFFFFFFFF.
/// @param bannedSince Time the address was banned else 0xFFFFFFFF.
struct State {
    uint32 addedSince;
    uint32 approvedSince;
    uint32 bannedSince;
}

/// Config to initialize a Verify contract with.
/// @param admin The address to ASSIGN ALL ADMIN ROLES to initially. This
/// address is free and encouraged to delegate fine grained permissions to
/// many other sub-admin addresses, then revoke it's own "root" access.
/// @param callback The address of the `IVerifyCallbackV1` contract if it exists.
/// MAY be `address(0)` to signify that callbacks should NOT run.
struct VerifyConfig {
    address admin;
    address callback;
}

/// @title Verify
/// Trust-minimised contract to record the state of some verification process.
/// When some off-chain identity is to be reified on chain there is inherently
/// some multi-party, multi-faceted trust relationship. For example, the DID
/// (Decentralized Identifiers) specification from W3C outlines that the
/// controller and the subject of an identity are two different entities.
///
/// This is because self-identification is always problematic to the point of
/// being uselessly unbelievable.
///
/// For example, I can simply say "I am the queen of England" and what
/// onchain mechanism could possibly check, let alone stop me?
/// The same problem exists in any situation where some privilege or right is
/// associated with identity. Consider passports, driver's licenses,
/// celebrity status, age, health, accredited investor, social media account,
/// etc. etc.
///
/// Typically crypto can't and doesn't want to deal with this issue. The usual
/// scenario is that some system demands personal information, which leads to:
///
/// - Data breaches that put individual's safety at risk. Consider the December
///   2020 leak from Ledger that dumped 270 000 home addresses and phone
///   numbers, and another million emails, of hardware wallet owners on a
///   public forum.
/// - Discriminatory access, undermining an individual's self-sovereign right
///   to run a full node, self-host a GUI and broadcast transactions onchain.
///   Consider the dydx airdrop of 2021 where metadata about a user's access
///   patterns logged on a server were used to deny access to presumed
///   Americans over regulatory fears.
/// - An entrenched supply chain of centralized actors from regulators, to
///   government databases, through KYC corporations, platforms, etc. each of
///   which holds an effective monopoly over, and ability to manipulate user's
///   "own" identity.
///
/// These examples and others are completely antithetical to and undermine the
/// safety of an opt-in, permissionless system based on pseudonomous actors
/// self-signing actions into a shared space.
///
/// That said, one can hardly expect a permissionless pseudonomous system
/// founded on asynchronous value transfers to succeed without at least some
/// concept of curation and reputation.
///
/// Anon, will you invest YOUR money in anon's project?
///
/// Clearly for every defi blue chip there are 10 000 scams and nothing onchain
/// can stop a scam, this MUST happen at the social layer.
///
/// Rain protocol is agnostic to how this verification happens. A government
/// regulator is going to want a government issued ID cross-referenced against
/// international sanctions. A fan of some social media influencer wants to
/// see a verified account on that platform. An open source software project
/// should show a github profile. A security token may need evidence from an
/// accountant showing accredited investor status. There are so many ways in
/// which BOTH sides of a fundraise may need to verify something about
/// themselves to each other via a THIRD PARTY that Rain cannot assume much.
///
/// The trust model and process for Rain verification is:
///
/// - There are many `Verify` contracts, each represents a specific
///   verification method with a (hopefully large) set of possible reviewers.
/// - The verifyee compiles some evidence that can be referenced in some
///   relevant system. It could be a session ID in a KYC provider's database or
///   a tweet from a verified account, etc. The evidence is passed to the
///   `Verify` contract as raw bytes so it is opaque onchain, but visible as an
///   event to verifiers.
/// - The verifyee calls `add` _for themselves_ to initialize their state and
///   emit the evidence for their account, after which they _cannot change_
///   their submission without appealing to someone who can remove. This costs
///   gas, so why don't we simply ask the user to sign something and have an
///   approver verify the signed data? Because we want to leverage both the
///   censorship resistance and asynchronous nature of the underlying
///   blockchain. Assuming there are N possible approvers, we want ANY 1 of
///   those N approvers to be able to review and approve an application. If the
///   user is forced to submit their application directly to one SPECIFIC
///   approver we lose this property. In the gasless model the user must then
///   rely on their specific approver both being online and not to censor the
///   request. It's also possible that many accounts add the same evidence,
///   after all it will be public in the event logs, so it is important for
///   approvers to verify the PAIRING between account and evidence.
/// - ANY account with the `APPROVER` role can review the evidence by
///   inspecting the event logs. IF the evidence is valid then the `approve`
///   function should be called by the approver. Approvers MAY also approve and
///   implicitly add any account atomically if the account did not previously
///   add itself.
/// - ANY account with the `BANNER` role can veto either an add OR a prior
///   approval. In the case of a false positive, i.e. where an account was
///   mistakenly approved, an appeal can be made to a banner to update the
///   status. Bad accounts SHOULD BE BANNED NOT REMOVED. When an account is
///   removed, its onchain state is once again open for the attacker to
///   resubmit new fraudulent evidence and potentially be reapproved.
///   Once an account is banned, any attempt by the account holder to change
///   their status, or an approver to approve will be rejected. Downstream
///   consumers of a `State` MUST check for an existing ban. Banners MAY ban
///   and implicity add any account atomically if the account did not
///   previously add itself.
///   - ANY account with the `REMOVER` role can scrub the `State` from an
///   account. Of course, this is a blockchain so the state changes are all
///   still visible to full nodes and indexers in historical data, in both the
///   onchain history and the event logs for each state change. This allows an
///   account to appeal to a remover in the case of a MISTAKEN BAN or also in
///   the case of a MISTAKEN ADD (e.g. mistake in evidence), effecting a
///   "hard reset" at the contract storage level.
///
/// Banning some account with an invalid session is NOT required. It is
/// harmless for an added session to remain as `Status.Added` indefinitely.
/// For as long as no approver decides to approve some invalid added session it
/// MUST be treated as equivalent to a ban by downstream contracts. This is
/// important so that admins are only required to spend gas on useful actions.
///
/// In addition to `Approve`, `Ban`, `Remove` there are corresponding events
/// `RequestApprove`, `RequestBan`, `RequestRemove` that allow for admins to be
/// notified that some new evidence must be considered that may lead to each
/// action. `RequestApprove` is automatically submitted as part of the `add`
/// call, but `RequestBan` and `RequestRemove` must be manually called
///
/// Rain uses standard Open Zeppelin `AccessControl` and is agnostic to how the
/// approver/remover/banner roles and associated admin roles are managed.
/// Ideally the more credibly neutral qualified parties assigend to each role
/// for each `Verify` contract the better. This improves the censorship
/// resistance of the verification process and the responsiveness of the
/// end-user experience.
///
/// Ideally the admin account assigned at deployment would renounce their admin
/// rights after establishing a more granular and appropriate set of accounts
/// with each specific role.
///
/// There is no requirement that any of the privileged accounts with roles are
/// a single-key EOA, they may be multisig accounts or even a DAO with formal
/// governance processes mediated by a smart contract.
///
/// Every action emits an associated event and optionally calls an onchain
/// callback on a `IVerifyCallbackV1` contract set during initialize. As each
/// action my be performed in bulk dupes are not rolled back, instead the
/// events are emitted for every time the action is called and the callbacks
/// and onchain state changes are deduped. For example, an approve may be
/// called twice for a single account, but by different approvers, potentially
/// submitting different evidence for each approval. In this case the time of
/// the first approve will be used and the onchain callback will be called for
/// the first transaction only, but BOTH approvals will emit an event. This
/// logic is applied per-account, per-action across a batch of evidences.
contract Verify is IVerifyV1, AccessControl {
    using LibUint256Array for uint256[];
    using LibEvidence for uint256[];
    using LibVerifyStatus for VerifyStatus;

    /// Any state never held is UNINITIALIZED.
    /// Note that as per default evm an unset state is 0 so always check the
    /// `addedSince` time on a `State` before trusting an equality check on
    /// any other time.
    /// (i.e. removed or never added)
    uint32 private constant UNINITIALIZED = type(uint32).max;

    /// Emitted when the `Verify` contract is initialized.
    event Initialize(address sender, VerifyConfig config);

    /// Emitted when evidence is first submitted to approve an account.
    /// The requestor is always the `msg.sender` of the user calling `add`.
    /// @param sender The `msg.sender` that submitted its own evidence.
    /// @param evidence The evidence to support an approval.
    /// NOT written to contract storage.
    event RequestApprove(address sender, Evidence evidence);
    /// Emitted when a previously added account is approved.
    /// @param sender The `msg.sender` that approved `account`.
    /// @param evidence The approval data.
    event Approve(address sender, Evidence evidence);

    /// Currently approved accounts can request that any account be banned.
    /// The requestor is expected to provide supporting data for the ban.
    /// The requestor MAY themselves be banned if vexatious.
    /// @param sender The `msg.sender` requesting a ban of `account`.
    /// @param evidence Account + data the `requestor` feels will strengthen
    /// its case for the ban. NOT written to contract storage.
    event RequestBan(address sender, Evidence evidence);
    /// Emitted when an added or approved account is banned.
    /// @param sender The `msg.sender` that banned `account`.
    /// @param evidence Account + the evidence to support a ban.
    /// NOT written to contract storage.
    event Ban(address sender, Evidence evidence);

    /// Currently approved accounts can request that any account be removed.
    /// The requestor is expected to provide supporting data for the removal.
    /// The requestor MAY themselves be banned if vexatious.
    /// @param sender The `msg.sender` requesting a removal of `account`.
    /// @param evidence `Evidence` to justify a removal.
    event RequestRemove(address sender, Evidence evidence);
    /// Emitted when an account is scrubbed from blockchain state.
    /// Historical logs still visible offchain of course.
    /// @param sender The `msg.sender` that removed `account`.
    /// @param evidence `Evidence` to justify the removal.
    event Remove(address sender, Evidence evidence);

    /// Admin role for `APPROVER`.
    bytes32 public constant APPROVER_ADMIN = keccak256("APPROVER_ADMIN");
    /// Role for `APPROVER`.
    bytes32 public constant APPROVER = keccak256("APPROVER");

    /// Admin role for `REMOVER`.
    bytes32 public constant REMOVER_ADMIN = keccak256("REMOVER_ADMIN");
    /// Role for `REMOVER`.
    bytes32 public constant REMOVER = keccak256("REMOVER");

    /// Admin role for `BANNER`.
    bytes32 public constant BANNER_ADMIN = keccak256("BANNER_ADMIN");
    /// Role for `BANNER`.
    bytes32 public constant BANNER = keccak256("BANNER");

    /// Account => State
    mapping(address => State) private states;

    /// Optional IVerifyCallbackV1 contract.
    /// MAY be address 0.
    IVerifyCallbackV1 public callback;

    constructor() {
        _disableInitializers();
    }

    /// Initializes the `Verify` contract e.g. as cloned by a factory.
    /// @param config_ The config required to initialize the contract.
    function initialize(VerifyConfig memory config_) external initializer {
        require(config_.admin != address(0), "0_ACCOUNT");
        __AccessControl_init();

        // `APPROVER_ADMIN` can admin each other in addition to
        // `APPROVER` addresses underneath.
        _setRoleAdmin(APPROVER_ADMIN, APPROVER_ADMIN);
        _setRoleAdmin(APPROVER, APPROVER_ADMIN);

        // `REMOVER_ADMIN` can admin each other in addition to
        // `REMOVER` addresses underneath.
        _setRoleAdmin(REMOVER_ADMIN, REMOVER_ADMIN);
        _setRoleAdmin(REMOVER, REMOVER_ADMIN);

        // `BANNER_ADMIN` can admin each other in addition to
        // `BANNER` addresses underneath.
        _setRoleAdmin(BANNER_ADMIN, BANNER_ADMIN);
        _setRoleAdmin(BANNER, BANNER_ADMIN);

        // It is STRONGLY RECOMMENDED that the `admin_` delegates specific
        // admin roles then revokes the `X_ADMIN` roles. From themselves.
        // It is ALSO RECOMMENDED that each of the sub-`X_ADMIN` roles revokes
        // their admin rights once sufficient approvers/removers/banners have
        // been assigned, if possible. Admins can instantly/atomically assign
        // and revoke admin privileges from each other, so a compromised key
        // can irreperably damage a `Verify` contract instance.
        _grantRole(APPROVER_ADMIN, config_.admin);
        _grantRole(REMOVER_ADMIN, config_.admin);
        _grantRole(BANNER_ADMIN, config_.admin);

        callback = IVerifyCallbackV1(config_.callback);

        emit Initialize(msg.sender, config_);
    }

    /// Typed accessor into states.
    /// @param account_ The account to return the current `State` for.
    function state(address account_) external view returns (State memory) {
        return states[account_];
    }

    /// Derives a single `Status` from a `State` and a reference timestamp.
    /// @param state_ The raw `State` to reduce into a `Status`.
    /// @param timestamp_ The timestamp to compare `State` against.
    /// @return status_ The status in `State` given `timestamp_`.
    function statusAtTime(
        State memory state_,
        uint256 timestamp_
    ) public pure returns (VerifyStatus status_) {
        // The state hasn't even been added so is picking up time zero as the
        // evm fallback value. In this case if we checked other times using
        // a `<=` equality they would incorrectly return `true` always due to
        // also having a `0` fallback value.
        // Using `< 1` here to silence slither.
        if (state_.addedSince < 1) {
            status_ = VerifyConstants.STATUS_NIL;
        }
        // Banned takes priority over everything.
        else if (state_.bannedSince <= timestamp_) {
            status_ = VerifyConstants.STATUS_BANNED;
        }
        // Approved takes priority over added.
        else if (state_.approvedSince <= timestamp_) {
            status_ = VerifyConstants.STATUS_APPROVED;
        }
        // Added is lowest priority.
        else if (state_.addedSince <= timestamp_) {
            status_ = VerifyConstants.STATUS_ADDED;
        }
        // The `addedSince` time is after `timestamp_` so `Status` is nil
        // relative to `timestamp_`.
        else {
            status_ = VerifyConstants.STATUS_NIL;
        }
    }

    /// @inheritdoc IVerifyV1
    function accountStatusAtTime(
        address account_,
        uint256 timestamp_
    ) external view virtual returns (VerifyStatus) {
        return statusAtTime(states[account_], timestamp_);
    }

    /// Requires that `msg.sender` is approved as at the current timestamp.
    modifier onlyApproved() {
        require(
            statusAtTime(states[msg.sender], block.timestamp).eq(
                VerifyConstants.STATUS_APPROVED
            ),
            "ONLY_APPROVED"
        );
        _;
    }

    /// @dev Builds a new `State` for use by `add` and `approve`.
    function newState() private view returns (State memory state_) {
        state_ = State(uint32(block.timestamp), UNINITIALIZED, UNINITIALIZED);
    }

    /// An account adds their own verification evidence.
    /// Internally `msg.sender` is used; delegated `add` is not supported.
    /// @param data_ The evidence to support approving the `msg.sender`.
    function add(bytes calldata data_) external {
        State memory state_ = states[msg.sender];
        VerifyStatus currentStatus_ = statusAtTime(state_, block.timestamp);
        require(
            !currentStatus_.eq(VerifyConstants.STATUS_APPROVED) &&
                !currentStatus_.eq(VerifyConstants.STATUS_BANNED),
            "ALREADY_EXISTS"
        );
        // An account that hasn't already been added need a new state.
        // If an account has already been added but not approved or banned
        // they can emit many `RequestApprove` events without changing
        // their state. This facilitates multi-step workflows for the KYC
        // provider, e.g. to implement a commit+reveal scheme or simply
        // request additional evidence from the applicant before final
        // verdict.
        if (currentStatus_.eq(VerifyConstants.STATUS_NIL)) {
            states[msg.sender] = newState();
        }
        Evidence memory evidence_ = Evidence(msg.sender, data_);
        emit RequestApprove(msg.sender, evidence_);

        // Call the `afterAdd_` hook to allow inheriting contracts to enforce
        // requirements.
        // The inheriting contract MUST `require` or otherwise enforce its
        // needs to rollback a bad add.
        IVerifyCallbackV1 callback_ = callback;
        if (address(callback_) != address(0)) {
            Evidence[] memory evidences_ = new Evidence[](1);
            evidences_[0] = evidence_;
            callback_.afterAdd(msg.sender, evidences_);
        }
    }

    /// An `APPROVER` can review added evidence and approve accounts.
    /// Typically many approvals would be submitted in a single call which is
    /// more convenient and gas efficient than sending individual transactions
    /// for every approval. However, as there are many individual agents
    /// acting concurrently and independently this requires that the approval
    /// process be infallible so that no individual approval can rollback the
    /// entire batch due to the actions of some other approver/banner. It is
    /// possible to approve an already approved or banned account. The
    /// `Approve` event will always emit but the approved time will only be
    /// set if it was previously uninitialized. A banned account will always
    /// be seen as banned when calling `statusAtTime` regardless of the
    /// approval time, even if the approval is more recent than the ban. The
    /// only way to reset a ban is to remove and reapprove the account.
    /// @param evidences_ All evidence for all approvals.
    function approve(Evidence[] memory evidences_) external onlyRole(APPROVER) {
        unchecked {
            State memory state_;
            uint256[] memory addedRefs_ = new uint256[](evidences_.length);
            uint256[] memory approvedRefs_ = new uint256[](evidences_.length);
            uint256 additions_ = 0;
            uint256 approvals_ = 0;

            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                Evidence memory evidence_ = evidences_[i_];
                state_ = states[evidence_.account];
                // If the account hasn't been added an approver can still add
                // and approve it on their behalf.
                if (state_.addedSince < 1) {
                    state_ = newState();

                    LibEvidence._updateEvidenceRef(
                        addedRefs_,
                        evidence_,
                        additions_
                    );
                    additions_++;
                }
                // If the account hasn't been approved we approve it. As there
                // are many approvers operating independently and concurrently
                // we do NOT `require` the approval be unique, but we also do
                // NOT change the time as the oldest approval is most
                // important. However we emit an event for every approval even
                // if the state does not change.
                // It is possible to approve a banned account but
                // `statusAtTime` will ignore the approval time for any banned
                // account and use the banned time only.
                if (state_.approvedSince == UNINITIALIZED) {
                    state_.approvedSince = uint32(block.timestamp);
                    states[evidence_.account] = state_;

                    LibEvidence._updateEvidenceRef(
                        approvedRefs_,
                        evidence_,
                        approvals_
                    );
                    approvals_++;
                }

                // Always emit an `Approve` event even if we didn't write to
                // storage. This ensures that supporting evidence hits the logs
                // for offchain review.
                emit Approve(msg.sender, evidence_);
            }
            IVerifyCallbackV1 callback_ = callback;
            if (address(callback_) != address(0)) {
                if (additions_ > 0) {
                    addedRefs_.truncate(additions_);
                    callback_.afterAdd(msg.sender, addedRefs_.asEvidences());
                }
                if (approvals_ > 0) {
                    approvedRefs_.truncate(approvals_);
                    callback_.afterApprove(
                        msg.sender,
                        approvedRefs_.asEvidences()
                    );
                }
            }
        }
    }

    /// Any approved address can request some address be approved.
    /// Frivolous requestors SHOULD expect to find themselves banned.
    /// @param evidences_ Array of evidences to request approvals for.
    function requestApprove(
        Evidence[] calldata evidences_
    ) external onlyApproved {
        unchecked {
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                emit RequestApprove(msg.sender, evidences_[i_]);
            }
        }
    }

    /// A `BANNER` can ban an added OR approved account.
    /// @param evidences_ All evidence appropriate for all bans.
    function ban(Evidence[] calldata evidences_) external onlyRole(BANNER) {
        unchecked {
            State memory state_;
            uint256[] memory addedRefs_ = new uint256[](evidences_.length);
            uint256[] memory bannedRefs_ = new uint256[](evidences_.length);
            uint256 additions_ = 0;
            uint256 bans_ = 0;
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                Evidence memory evidence_ = evidences_[i_];
                state_ = states[evidence_.account];

                // There is no requirement that an account be formerly added
                // before it is banned. For example some fraud may be detected
                // in an affiliated `Verify` contract and the evidence can be
                // used to ban the same address in the current contract. In
                // this case the account will be added and banned in this call.
                if (state_.addedSince < 1) {
                    state_ = newState();

                    LibEvidence._updateEvidenceRef(
                        addedRefs_,
                        evidence_,
                        additions_
                    );
                    additions_++;
                }
                // Respect prior bans by leaving onchain storage as-is.
                if (state_.bannedSince == UNINITIALIZED) {
                    state_.bannedSince = uint32(block.timestamp);
                    states[evidence_.account] = state_;

                    LibEvidence._updateEvidenceRef(
                        bannedRefs_,
                        evidence_,
                        bans_
                    );
                    bans_++;
                }

                // Always emit a `Ban` event even if we didn't write state. This
                // ensures that supporting evidence hits the logs for offchain
                // review.
                emit Ban(msg.sender, evidence_);
            }
            IVerifyCallbackV1 callback_ = callback;
            if (address(callback_) != address(0)) {
                if (additions_ > 0) {
                    addedRefs_.truncate(additions_);
                    callback_.afterAdd(msg.sender, addedRefs_.asEvidences());
                }
                if (bans_ > 0) {
                    bannedRefs_.truncate(bans_);
                    callback_.afterBan(msg.sender, bannedRefs_.asEvidences());
                }
            }
        }
    }

    /// Any approved address can request some address be banned.
    /// Frivolous requestors SHOULD expect to find themselves banned.
    /// @param evidences_ Array of evidences to request banning for.
    function requestBan(Evidence[] calldata evidences_) external onlyApproved {
        unchecked {
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                emit RequestBan(msg.sender, evidences_[i_]);
            }
        }
    }

    /// A `REMOVER` can scrub state mapping from an account.
    /// A malicious account MUST be banned rather than removed.
    /// Removal is useful to reset the whole process in case of some mistake.
    /// @param evidences_ All evidence to suppor the removal.
    function remove(Evidence[] memory evidences_) external onlyRole(REMOVER) {
        unchecked {
            State memory state_;
            uint256[] memory removedRefs_ = new uint256[](evidences_.length);
            uint256 removals_ = 0;
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                Evidence memory evidence_ = evidences_[i_];
                state_ = states[evidences_[i_].account];
                if (state_.addedSince > 0) {
                    delete (states[evidence_.account]);
                    LibEvidence._updateEvidenceRef(
                        removedRefs_,
                        evidence_,
                        removals_
                    );
                    removals_++;
                }
                emit Remove(msg.sender, evidence_);
            }
            IVerifyCallbackV1 callback_ = callback;
            if (address(callback_) != address(0)) {
                if (removals_ > 0) {
                    removedRefs_.truncate(removals_);
                    callback_.afterRemove(
                        msg.sender,
                        removedRefs_.asEvidences()
                    );
                }
            }
        }
    }

    /// Any approved address can request some address be removed.
    /// Frivolous requestors SHOULD expect to find themselves banned.
    /// @param evidences_ Array of evidences to request removal of.
    function requestRemove(
        Evidence[] calldata evidences_
    ) external onlyApproved {
        unchecked {
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                emit RequestRemove(msg.sender, evidences_[i_]);
            }
        }
    }
}
