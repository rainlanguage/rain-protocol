// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IFactory.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "../tier/ITierV2.sol";

/// Defines the ERC20 token fee taken by the curator upon child creation.
/// @param token The address of the ERC20 token to send to the curator.
/// @param amount The amount of token to send to the curator for each child.
struct CurationFeeConfig {
    address token;
    uint256 amount;
}

/// Defines the minimum tier requirements for users to create a curated child.
/// @param tierContract The tier contract that will be checked when a curated
/// child is created.
/// @param minimumTier The minimum tier that the user must hold at the time they
/// attempt to deploy a curated child.
/// @param context Additional context that will be passed to the ITierV2 report
/// function when the tier is checked.
struct CurationTierConfig {
    address tierContract;
    uint256 minimumTier;
    uint256[] context;
}

/// Defines a curated child creation process.
/// @param factory The underlying factory that will create the child contract.
/// @param curator The address of the curator that is helping the user deploy a
/// contract from the underlying factory.
/// @param feeConfig The configuration for fees taken by the curator.
/// @param tierConfig The configuration for tier restrictions on the curated
/// child deployment.
struct CurationConfig {
    address factory;
    address curator;
    CurationFeeConfig feeConfig;
    CurationTierConfig tierConfig;
}

/// @title FactoryCurator
/// @notice Various frontends and toolkits MAY want to charge a fee for the
/// service of providing a premium user exerience when deploying children from
/// factories. Users that can directly interact with factory contracts or who
/// are willing to use basic frontends can bypass the `FactoryCurator`. Any user
/// of a premium frontend will need to pay for the curation unless they tamper
/// with the transaction presented to them by the frontend at moment of deploy.
/// Most users of a premium frontend SHOULD be willing to pay the curation fee
/// or at least are not technical enough to modify transaction inputs manually.
/// The reliability of the curation fees MUST NOT be assumed to be 100%
/// guaranteed, much as other fees collected in Rain, e.g. sale fees.
/// Curators can also use tier contracts to gate access to curated child
/// deployments which may help build exclusivity features into their services
/// and to meet various geopolitical and regulatory requirements.
///
/// A single `FactoryCurator` instance is sufficient to service arbitrarily many
/// curators and factories. First curators (or their representative) registers
/// themselves and their terms against the `FactoryCurator`, this assigns an ID
/// to their configuration. Each user then provides the same terms and ID as
/// acceptance of the curation conditions, which then forwards tokens and
/// enforces tier restrictions.
contract FactoryCurator {
    using SafeERC20 for IERC20;

    /// Emitted when a curator registers their terms and conditions with the
    /// `FactoryCurator` contract.
    /// @param sender `msg.sender` registering the terms, MAY NOT be the
    /// curator.
    /// @param id The autoincrementing ID assigned to this curation
    /// registration.
    /// @param config All curation config for this registration.
    event RegisterCuration(address sender, uint256 id, CurationConfig config);

    /// @dev Autoincrementing ids for each curation registration.
    uint256 private highwaterId;
    /// @dev Hashes of registered curation config. Users must supply a config
    /// that matches the hash when they deploy a curated child.
    mapping(uint256 => bytes32) private curationConfigRegistry;

    /// Anyone can register curation config that can later be referenced by a
    /// user. The registrant MAY NOT be the curator because the curator is free
    /// to ignore any registered config. Many registered configurations may
    /// reference any given curator and the curator's preferred one will be
    /// handed to the user when a curated child is deployed.
    /// @param config_ All config required to process a curated child
    /// deployment. Will be hashed under an autoincremented ID and available for
    /// the curator to pass to the user later. This isn't really secure as a
    /// user can register their own config to reference later, or simply
    /// interact with the underlying factory directly. All this enforces is that
    /// if a user does provide a config ID, the curation payment and tier checks
    /// will always behave the same way.
    function registerConfig(
        CurationConfig calldata config_
    ) external returns (uint256 id_) {
        unchecked {
            id_ = highwaterId + 1;
        }
        highwaterId = id_;

        curationConfigRegistry[id_] = keccak256(abi.encode(config_));
        emit RegisterCuration(msg.sender, id_, config_);
    }

    /// Curated wrapper around IFactory.createChild.
    /// If a user chooses to call this instead of the underlying factory and
    /// they provide a config ID that references a curator, they MUST provide
    /// matching configuration that was registered. This allows curators to be
    /// confident that everyone using their config id has the same curation
    /// rules applied to the deployment.
    /// If the curation config matches then the user will have the fee forwarded
    /// to the curator and the call will revert if the user does not hold the
    /// minimum tier on the tier contract. The user MUST approve the fee before
    /// the `FactoryCurator` can transfer it.
    /// @param id_ The id that the curation config was registered under
    /// prior to this call.
    /// @param config_ The curation config registered against the id. MUST match
    /// the registered config or the deployment will revert.
    /// @param createChild_ All the data forwarded to the internal create child
    /// call on the underlying factory.
    /// @return child_ The child address as per IFactory.
    function createChild(
        uint256 id_,
        CurationConfig calldata config_,
        bytes calldata createChild_
    ) external returns (address) {
        require(
            curationConfigRegistry[id_] == keccak256(abi.encode(config_)),
            "NOT_IN_REGISTRY"
        );
        require(
            ITierV2(config_.tierConfig.tierContract).reportTimeForTier(
                msg.sender,
                config_.tierConfig.minimumTier,
                config_.tierConfig.context
            ) <= block.timestamp,
            "MINIMUM_TIER"
        );
        IERC20(config_.feeConfig.token).safeTransferFrom(
            msg.sender,
            config_.curator,
            config_.feeConfig.amount
        );
        return IFactory(config_.factory).createChild(createChild_);
    }
}
