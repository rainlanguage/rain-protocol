// SPDX-License-Identifier: UNLICENSE
pragma solidity ^0.8.0;

/// @title IERC4626
/// https://eips.ethereum.org/EIPS/eip-4626
///
/// EIP-4626: Tokenized Vault Standard
/// A standard for tokenized Vaults with a single underlying ERC-20 token.
///
/// Abstract
/// The following standard allows for the implementation of a standard API for
/// tokenized Vaults representing shares of a single underlying ERC-20 token.
/// This standard is an extension on the ERC-20 token that provides basic
/// functionality for depositing and withdrawing tokens and reading balances.
///
/// Motivation
/// Tokenized Vaults have a lack of standardization leading to diverse
/// implementation details. Some various examples include lending markets,
/// aggregators, and intrinsically interest bearing tokens. This makes
/// integration difficult at the aggregator or plugin layer for protocols which
/// need to conform to many standards, and forces each protocol to implement
/// their own adapters which are error prone and waste development resources.
///
/// A standard for tokenized Vaults will lower the integration effort for
/// yield-bearing vaults, while creating more consistent and robust
/// implementation patterns.
///
/// Specification
/// All ERC-4626 tokenized Vaults MUST implement ERC-20 to represent shares.
/// If a Vault is to be non-transferrable, it MAY revert on calls to transfer
/// or transferFrom. The ERC-20 operations balanceOf, transfer, totalSupply,
/// etc. operate on the Vault “shares” which represent a claim to ownership on
/// a fraction of the Vault’s underlying holdings.
///
/// All ERC-4626 tokenized Vaults MUST implement ERC-20’s optional metadata
/// extensions. The name and symbol functions SHOULD reflect the underlying
/// token’s name and symbol in some way.
///
/// ERC-4626 tokenized Vaults MAY implement EIP-2612 to improve the UX of
/// approving shares on various integrations.
///
///  Definitions:
///  - asset: The underlying token managed by the Vault. Has units defined by
///    the corresponding ERC-20 contract.
///  - share: The token of the Vault. Has a ratio of underlying assets
///    exchanged on mint/deposit/withdraw/redeem (as defined by the Vault).
///  - fee: An amount of assets or shares charged to the user by the Vault.
///    Fees can exists for deposits, yield, AUM, withdrawals, or anything else
///    prescribed by the Vault.
///  - slippage: Any difference between advertised share price and economic
///    realities of deposit to or withdrawal from the Vault, which is not
///    accounted by fees.
///
/// Rationale
/// The Vault interface is designed to be optimized for integrators with a
/// feature complete yet minimal interface. Details such as accounting and
/// allocation of deposited tokens are intentionally not specified, as Vaults
/// are expected to be treated as black boxes on-chain and inspected off-chain
/// before use.
///
/// ERC-20 is enforced because implementation details like token approval and
/// balance calculation directly carry over to the shares accounting. This
/// standardization makes the Vaults immediately compatible with all ERC-20 use
/// cases in addition to ERC-4626.
///
/// The mint method was included for symmetry and feature completeness. Most
/// current use cases of share-based Vaults do not ascribe special meaning to
/// the shares such that a user would optimize for a specific number of shares
/// (mint) rather than specific amount of underlying (deposit). However, it is
/// easy to imagine future Vault strategies which would have unique and
/// independently useful share representations.
///
/// The convertTo functions serve as rough estimates that do not account for
/// operation specific details like withdrawal fees, etc. They were included
/// for frontends and applications that need an average value of shares or
/// assets, not an exact value possibly including slippage or other fees. For
/// applications that need an exact value that attempts to account for fees and
/// slippage we have included a corresponding preview function to match each
/// mutable function. These functions must not account for deposit or
/// withdrawal limits, to ensure they are easily composable, the max functions
/// are provided for that purpose.
///
/// Backwards Compatibility
/// ERC-4626 is fully backward compatible with the ERC-20 standard and has no
/// known compatibility issues with other standards. For production
/// implementations of Vaults which do not use ERC-4626, wrapper adapters can
/// be developed and used.
///
/// Security Considerations
/// Fully permissionless use cases could fall prey to malicious implementations
/// which only conform to the interface but not the specification. It is
/// recommended that all integrators review the implementation for potential
/// ways of losing user deposits before integrating.
///
/// If implementors intend to support EOA account access directly, they should
/// consider adding an additional function call for
/// deposit/mint/withdraw/redeem with the means to accommodate slippage loss or
/// unexpected deposit/withdrawal limits, since they have no other means to
/// revert the transaction if the exact output amount is not achieved.
///
/// The methods totalAssets, convertToShares and convertToAssets are estimates
/// useful for display purposes, and do not have to confer the exact amount of
/// underlying assets their context suggests.
///
/// The preview methods return values that are as close as possible to exact as
/// possible. For that reason, they are manipulable by altering the on-chain
/// conditions and are not always safe to be used as price oracles. This
/// specification includes convert methods that are allowed to be inexact and
/// therefore can be implemented as robust price oracles. For example, it would
/// be correct to implement the convert methods as using a time-weighted
/// average price in converting between assets and shares.
///
/// Integrators of ERC-4626 Vaults should be aware of the difference between
/// these view methods when integrating with this standard. Additionally, note
/// that the amount of underlying assets a user may receive from redeeming
/// their Vault shares (previewRedeem) can be significantly different than the
/// amount that would be taken from them when minting the same quantity of
/// shares (previewMint). The differences may be small (like if due to rounding
/// error), or very significant (like if a Vault implements withdrawal or
/// deposit fees, etc). Therefore integrators should always take care to use
/// the preview function most relevant to their use case, and never assume they
/// are interchangeable.
///
/// Finally, ERC-4626 Vault implementers should be aware of the need for
/// specific, opposing rounding directions across the different mutable and
/// view methods, as it is considered most secure to favor the Vault itself
/// during calculations over its users:
///
/// - If (1) it’s calculating how many shares to issue to a user for a certain
///   amount of the underlying tokens they provide or (2) it’s determining the
///   amount of the underlying tokens to transfer to them for returning a
///   certain amount of shares, it should round down.
/// - If (1) it’s calculating the amount of shares a user has to supply to
///   receive a given amount of the underlying tokens or (2) it’s calculating
///   the amount of underlying tokens a user has to provide to receive a
///   certain amount of shares, it should round up.
///
/// The only functions where the preferred rounding direction would be
/// ambiguous are the convertTo functions. To ensure consistency across all
/// ERC-4626 Vault implementations it is specified that these functions MUST
/// both always round down. Integrators may wish to mimic rounding up versions
/// of these functions themselves, like by adding 1 wei to the result.
///
/// Although the convertTo functions should eliminate the need for any use of
/// an ERC-4626 Vault’s decimals variable, it is still strongly recommended to
/// mirror the underlying token’s decimals if at all possible, to eliminate
/// possible sources of confusion and simplify integration across front-ends
/// and for other off-chain users.
///
/// Copyright
/// Copyright and related rights waived via CC0.
///
/// Citation
/// Please cite this document as:
/// Joey Santoro, t11s, Jet Jadeja, Alberto Cuesta Cañada, Señor Doggo,
/// "EIP-4626: Tokenized Vault Standard," Ethereum Improvement Proposals, no.
/// 4626, December 2021. [Online serial].
/// Available: https://eips.ethereum.org/EIPS/eip-4626.
interface IERC4626 {
    /// Caller has exchanged assets for shares, and transferred those shares to
    /// owner.
    /// MUST be emitted when tokens are deposited into the Vault via the mint
    /// and deposit methods.
    /// @param caller `msg.sender` depositing assets for shares.
    /// @param owner recipient of the newly minted shares.
    /// @param assets amount of assets deposited.
    /// @param shares amount of shares minted and sent to owner.
    event Deposit(
        address indexed caller,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    /// Caller has exchanged shares, owned by owner, for assets, and
    /// transferred those assets to receiver.
    /// MUST be emitted when shares are withdrawn from the Vault in
    /// ERC4626.redeem or ERC4626.withdraw methods.
    /// @param caller `msg.sender` initiating the withdraw.
    /// @param receiver recipient of withdrawn assets.
    /// @param owner owner of shares burned to withdraw assets.
    /// @param assets amount of assets withdrawn and sent to receiver.
    /// @param shares amount of shares burned from owner.
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    /// The address of the underlying token used for the Vault for accounting,
    /// depositing, and withdrawing.
    /// MUST be an ERC-20 token contract.
    /// MUST NOT revert.
    /// @return assetTokenAddress address of the asset token.
    function asset() external view returns (address assetTokenAddress);

    /// Total amount of the underlying asset that is “managed” by Vault.
    /// SHOULD include any compounding that occurs from yield.
    /// MUST be inclusive of any fees that are charged against assets in the
    /// Vault.
    /// MUST NOT revert.
    /// @return totalManagedAssets all assets in the vault including those that
    /// cannot be withdrawn with shares due to fees or were never deposited,
    /// perhaps due to fee accruals, etc.
    function totalAssets() external view returns (uint256 totalManagedAssets);

    /// The amount of shares that the Vault would exchange for the amount of
    /// assets provided, in an ideal scenario where all the conditions are met.
    /// MUST NOT be inclusive of any fees that are charged against assets in
    /// the Vault.
    /// MUST NOT show any variations depending on the caller.
    /// MUST NOT reflect slippage or other on-chain conditions, when performing
    /// the actual exchange.
    /// MUST NOT revert unless due to integer overflow caused by an
    /// unreasonably large input.
    /// MUST round down towards 0.
    /// This calculation MAY NOT reflect the “per-user” price-per-share, and
    /// instead should reflect the “average-user’s” price-per-share, meaning
    /// what the average user should expect to see when exchanging to and from.
    /// @param assets amount of assets that would hypothetically be converted
    /// to shares (minting) upon deposit.
    /// @return shares amount of shares that hypothetically would be minted upon
    /// deposit of given amount of assets.
    function convertToShares(uint256 assets)
        external
        view
        returns (uint256 shares);

    /// The amount of assets that the Vault would exchange for the amount of
    /// shares provided, in an ideal scenario where all the conditions are met.
    /// MUST NOT be inclusive of any fees that are charged against assets in
    /// the Vault.
    /// MUST NOT show any variations depending on the caller.
    /// MUST NOT reflect slippage or other on-chain conditions, when performing
    /// the actual exchange.
    /// MUST NOT revert unless due to integer overflow caused by an
    /// unreasonably large input.
    /// MUST round down towards 0.
    /// This calculation MAY NOT reflect the “per-user” price-per-share, and
    /// instead should reflect the “average-user’s” price-per-share, meaning
    /// what the average user should expect to see when exchanging to and from.
    /// @param shares amount of shares that would hypothetically be converted
    /// (burned) to assets upon withdrawal.
    /// @return assets amount of assets that would hypothetically be released
    /// from the vault when given amount of shares were burned.
    function convertToAssets(uint256 shares)
        external
        view
        returns (uint256 assets);

    /// Maximum amount of the underlying asset that can be deposited into the
    /// Vault for the receiver, through a deposit call.
    /// MUST return the maximum amount of assets deposit would allow to be
    /// deposited for receiver and not cause a revert, which MUST NOT be higher
    /// than the actual maximum that would be accepted (it should underestimate
    /// if necessary). This assumes that the user has infinite assets,
    /// i.e. MUST NOT rely on balanceOf of asset.
    /// MUST factor in both global and user-specific limits, like if deposits
    /// are entirely disabled (even temporarily) it MUST return 0.
    /// MUST return 2 ** 256 - 1 if there is no limit on the maximum amount of
    /// assets that may be deposited.
    /// MUST NOT revert.
    /// @param receiver the receiver of hypothetical newly minted shares, were
    /// a deposit to be processed.
    /// @return maxAssets the maximum assets the receiver could deposit and
    /// successfully receive shares.
    function maxDeposit(address receiver)
        external
        view
        returns (uint256 maxAssets);

    /// Allows an on-chain or off-chain user to simulate the effects of their
    /// deposit at the current block, given current on-chain conditions.
    /// MUST return as close to and no more than the exact amount of Vault
    /// shares that would be minted in a deposit call in the same transaction.
    /// I.e. deposit should return the same or more shares as previewDeposit if
    /// called in the same transaction.
    /// MUST NOT account for deposit limits like those returned from maxDeposit
    /// and should always act as though the deposit would be accepted,
    /// regardless if the user has enough tokens approved, etc.
    /// MUST be inclusive of deposit fees. Integrators should be aware of the
    /// existence of deposit fees.
    /// MUST NOT revert due to vault specific user/global limits. MAY revert
    /// due to other conditions that would also cause deposit to revert.
    /// Note that any unfavorable discrepancy between convertToShares and
    /// previewDeposit SHOULD be considered slippage in share price or some
    /// other type of condition, meaning the depositor will lose assets by
    /// depositing.
    /// @param assets amount of assets the `msg.sender` would hypothetically
    /// deposit for shares.
    /// @return shares amount of shares that would hypothetically be minted for
    /// the `msg.sender`. MAY differ from `convertToShares` as
    /// "the average user" could receive different shares to any specific user.
    function previewDeposit(uint256 assets)
        external
        view
        returns (uint256 shares);

    /// Mints shares Vault shares to receiver by depositing exactly amount of
    /// underlying tokens.
    /// MUST emit the Deposit event.
    /// MUST support ERC-20 approve / transferFrom on asset as a deposit flow.
    /// MAY support an additional flow in which the underlying tokens are owned
    /// by the Vault contract before the deposit execution, and are accounted
    /// for during deposit.
    /// MUST revert if all of assets cannot be deposited (due to deposit limit
    /// being reached, slippage, the user not approving enough underlying
    /// tokens to the Vault contract, etc).
    /// Note that most implementations will require pre-approval of the Vault
    /// with the Vault’s underlying asset token.
    /// @param assets amount of assets the `msg.sender` is depositing.
    /// @param receiver recipient of the newly minted shares.
    /// @return shares amount of newly minted shares for recipient.
    function deposit(uint256 assets, address receiver)
        external
        returns (uint256 shares);

    /// Maximum amount of shares that can be minted from the Vault for the
    /// receiver, through a mint call.
    /// MUST return the maximum amount of shares mint would allow to be
    /// deposited to receiver and not cause a revert, which MUST NOT be higher
    /// than the actual maximum that would be accepted (it should underestimate
    /// if necessary). This assumes that the user has infinite assets,
    /// i.e. MUST NOT rely on balanceOf of asset.
    /// MUST factor in both global and user-specific limits, like if mints are
    /// entirely disabled (even temporarily) it MUST return 0.
    /// MUST return 2 ** 256 - 1 if there is no limit on the maximum amount of
    /// shares that may be minted.
    /// MUST NOT revert.
    /// @param receiver hypothetical receiver of newly minted shares for
    /// depositing assets.
    /// @return maxShares maximum shares hypothetically mintable for the
    /// receiver for a successful deposit.
    function maxMint(address receiver)
        external
        view
        returns (uint256 maxShares);

    /// Allows an on-chain or off-chain user to simulate the effects of their
    /// mint at the current block, given current on-chain conditions.
    /// MUST return as close to and no fewer than the exact amount of assets
    /// that would be deposited in a mint call in the same transaction.
    /// I.e. mint should return the same or fewer assets as previewMint if
    /// called in the same transaction.
    /// MUST NOT account for mint limits like those returned from maxMint and
    /// should always act as though the mint would be accepted, regardless if
    /// the user has enough tokens approved, etc.
    /// MUST be inclusive of deposit fees. Integrators should be aware of the
    /// existence of deposit fees.
    /// MUST NOT revert due to vault specific user/global limits. MAY revert
    /// due to other conditions that would also cause mint to revert.
    /// Note that any unfavorable discrepancy between convertToAssets and
    /// previewMint SHOULD be considered slippage in share price or some other
    /// type of condition, meaning the depositor will lose assets by minting.
    /// @param shares amount of shares to hypothetically mint for `msg.sender`.
    /// MAY differ from `convertToShares` as "the average user" may differ from
    /// any specific user.
    /// @return assets amount of assets that would hypothetically be desposited
    /// for receiver to receive the given amount of shares.
    function previewMint(uint256 shares) external view returns (uint256 assets);

    /// Mints exactly shares Vault shares to receiver by depositing amount of
    /// underlying tokens.
    /// MUST emit the Deposit event.
    /// MUST support ERC-20 approve / transferFrom on asset as a mint flow. MAY
    /// support an additional flow in which the underlying tokens are owned by
    /// the Vault contract before the mint execution, and are accounted for
    /// during mint.
    /// MUST revert if all of shares cannot be minted (due to deposit limit
    /// being reached, slippage, the user not approving enough underlying
    /// tokens to the Vault contract, etc).
    /// Note that most implementations will require pre-approval of the Vault
    /// with the Vault’s underlying asset token.
    /// @param shares amount of shares to mint for receiver.
    /// @param receiver address that will receive newly minted shares.
    /// @return assets amount of assets that were deposited to mint shares.
    function mint(uint256 shares, address receiver)
        external
        returns (uint256 assets);

    /// Maximum amount of the underlying asset that can be withdrawn from the
    /// owner balance in the Vault, through a withdraw call.
    /// MUST return the maximum amount of assets that could be transferred from
    /// owner through withdraw and not cause a revert, which MUST NOT be higher
    /// than the actual maximum that would be accepted (it should underestimate
    /// if necessary).
    /// MUST factor in both global and user-specific limits, like if
    /// withdrawals are entirely disabled (even temporarily) it MUST return 0.
    /// MUST NOT revert.
    /// @param owner the owner of the shares that would hypothetically be
    /// burned to process a withdrawal.
    /// @return maxAssets the maximum amount of assets that could
    /// hypothetically be withdrawn by burning the owner's shares.
    function maxWithdraw(address owner)
        external
        view
        returns (uint256 maxAssets);

    /// Allows an on-chain or off-chain user to simulate the effects of their
    /// withdrawal at the current block, given current on-chain conditions.
    /// MUST return as close to and no fewer than the exact amount of Vault
    /// shares that would be burned in a withdraw call in the same transaction.
    /// I.e. withdraw should return the same or fewer shares as previewWithdraw
    /// if called in the same transaction.
    /// MUST NOT account for withdrawal limits like those returned from
    /// maxWithdraw and should always act as though the withdrawal would be
    /// accepted, regardless if the user has enough shares, etc.
    /// MUST be inclusive of withdrawal fees. Integrators should be aware of
    /// the existence of withdrawal fees.
    /// MUST NOT revert due to vault specific user/global limits. MAY revert
    /// due to other conditions that would also cause withdraw to revert.
    /// Note that any unfavorable discrepancy between convertToShares and
    /// previewWithdraw SHOULD be considered slippage in share price or some
    /// other type of condition, meaning the depositor will lose assets by
    /// depositing.
    /// @param assets amount of assets hypothetically being withdrawn by
    /// `msg.sender` by burning their shares.
    /// @return shares amount of shares that would be burned to withdraw the
    /// given amount of assets.
    function previewWithdraw(uint256 assets)
        external
        view
        returns (uint256 shares);

    /// Burns shares from owner and sends exactly assets of underlying tokens
    /// to receiver.
    /// MUST emit the Withdraw event.
    /// MUST support a withdraw flow where the shares are burned from owner
    /// directly where owner is msg.sender or msg.sender has ERC-20 approval
    /// over the shares of owner. MAY support an additional flow in which the
    /// shares are transferred to the Vault contract before the withdraw
    /// execution, and are accounted for during withdraw.
    /// MUST revert if all of assets cannot be withdrawn
    /// (due to withdrawal limit being reached, slippage, the owner not having
    /// enough shares, etc).
    /// Note that some implementations will require pre-requesting to the Vault
    /// before a withdrawal may be performed. Those methods should be performed
    /// separately.
    /// @param assets amount of assets to withdraw by burning owner's shares.
    /// @param receiver withdrawn assets will be sent to receiver.
    /// @param owner shares will be burned from owner to withdraw assets.
    /// @return shares amount of shares that were burned from owner to process
    /// the withdrawal.
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    /// Maximum amount of Vault shares that can be redeemed from the owner
    /// balance in the Vault, through a redeem call.
    /// MUST return the maximum amount of shares that could be transferred from
    /// owner through redeem and not cause a revert, which MUST NOT be higher
    /// than the actual maximum that would be accepted (it should underestimate
    /// if necessary).
    /// MUST factor in both global and user-specific limits, like if redemption
    /// is entirely disabled (even temporarily) it MUST return 0.
    /// MUST NOT revert.
    /// @param owner hypothetical share owner who is redeeming (burning) shares
    /// for asset withdrawal.
    /// @return maxShares maximum hypothetical shares that could be burned by
    /// the owner to withdraw assets.
    function maxRedeem(address owner) external view returns (uint256 maxShares);

    /// Allows an on-chain or off-chain user to simulate the effects of their
    /// redeemption at the current block, given current on-chain conditions.
    /// MUST return as close to and no more than the exact amount of assets
    /// that would be withdrawn in a redeem call in the same transaction.
    /// I.e. redeem should return the same or more assets as previewRedeem if
    /// called in the same transaction.
    /// MUST NOT account for redemption limits like those returned from
    /// maxRedeem and should always act as though the redemption would be
    /// accepted, regardless if the user has enough shares, etc.
    /// MUST be inclusive of withdrawal fees. Integrators should be aware of
    /// the existence of withdrawal fees.
    /// MUST NOT revert due to vault specific user/global limits. MAY revert
    /// due to other conditions that would also cause redeem to revert.
    /// Note that any unfavorable discrepancy between convertToAssets and
    /// previewRedeem SHOULD be considered slippage in share price or some
    /// other type of condition, meaning the depositor will lose assets by
    /// redeeming.
    /// @param shares amount of shares that would hypothetically be burned by
    /// `msg.sender` to withdraw assets.
    /// @return assets amount of assets that would hypothetically be withdrawn
    /// for recipient when burning given amount of owner's shares.
    function previewRedeem(uint256 shares)
        external
        view
        returns (uint256 assets);

    /// Burns exactly shares from owner and sends assets of underlying tokens
    /// to receiver.
    /// MUST emit the Withdraw event.
    /// MUST support a redeem flow where the shares are burned from owner
    /// directly where owner is msg.sender or msg.sender has ERC-20 approval
    /// over the shares of owner. MAY support an additional flow in which the
    /// shares are transferred to the Vault contract before the redeem
    /// execution, and are accounted for during redeem.
    /// MUST revert if all of shares cannot be redeemed
    /// (due to withdrawal limit being reached, slippage, the owner not having
    /// enough shares, etc).
    /// Note that some implementations will require pre-requesting to the Vault
    /// before a withdrawal may be performed. Those methods should be performed
    /// separately.
    /// @param shares amount of owner's shares to redeem (burn) to withdraw
    /// assets for receiver.
    /// @param receiver withdrawn assets will be sent to receiver.
    /// @param owner owner's shares will be burned to process the withdrawal
    /// of assets sent to receiver.
    /// @return assets amount of assets withdrawn and sent to receiver.
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);
}
