// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ClickPot
/// @notice USDC escrow for campaigns whose earned clicks are attested by a trusted operator.
/// @dev Amounts use the configured USDC's six-decimal base units. The token must be
/// a standard, non-rebasing, non-fee-on-transfer USDC. No chain addresses are embedded.
/// Pausing, revocation and campaign expiry do not invalidate previously earned clicks.
/// The operator is trusted to count clicks accurately and settle before withdrawal.
contract ClickPot is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant MIN_DURATION = 1 days;
    uint64 public constant MAX_DURATION = 180 days;
    uint64 public immutable closeNotice;
    uint64 public immutable settleGrace;
    uint256 public constant MAX_BATCH = 50;

    enum CreatorStatus {
        None,
        Approved,
        Revoked
    }

    /// @dev Small fields are grouped for packing; accounting uses full-width integers.
    struct Campaign {
        address owner;
        uint64 endsAt;
        bool paused;
        bool closing;
        uint128 ratePerClick;
        uint64 unlockAt;
        uint256 balance;
        uint256 totalDeposited;
        uint256 totalPaid;
    }

    IERC20 public immutable usdc;
    address public operator;
    uint256 public campaignCount;
    uint256 public totalPaidAll;
    uint256 public totalDepositedAll;

    mapping(uint256 => Campaign) private _campaigns;
    mapping(address => uint256[]) public ownerCampaigns;
    mapping(uint256 => mapping(address => CreatorStatus)) public creatorStatus;
    mapping(uint256 => mapping(address => uint256)) public earned;
    /// @notice Batch identifiers are consumed globally, not per campaign.
    mapping(bytes32 => bool) public usedBatch;
    /// @notice Deferred payouts reserved for creators and excluded from campaign balances.
    mapping(address => uint256) public claimable;

    error ZeroAddress();
    error CampaignNotFound();
    error NotCampaignOwner();
    error NotOperator();
    error InvalidRate();
    error InvalidDeposit();
    error InvalidDuration();
    error InvalidWindow();
    error InvalidAmount();
    error CampaignClosing();
    error CampaignEnded();
    error InvalidCreatorStatus();
    error WithdrawalLocked(uint64 unlockAt);
    error NothingToWithdraw();
    error NothingToClaim();
    error ArrayLengthMismatch();
    error InvalidBatchSize();
    error BatchAlreadyUsed();
    error CreatorNotRegistered();
    error InvalidClicks();
    error InsufficientBudget();
    error OwnershipChangesDisabled();
    error TimestampOverflow();

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event CampaignCreated(
        uint256 indexed id,
        address indexed owner,
        uint128 ratePerClick,
        uint128 deposit,
        uint64 endsAt
    );
    event ToppedUp(uint256 indexed id, uint256 amount);
    event CreatorApproved(uint256 indexed id, address indexed creator);
    event CreatorRevoked(uint256 indexed id, address indexed creator);
    event Paused(uint256 indexed id, bool paused);
    event CloseRequested(uint256 indexed id, uint64 unlockAt);
    event Withdrawn(uint256 indexed id, uint256 amount);
    event PayoutDeferred(uint256 indexed id, address indexed creator, uint256 amount);
    event Claimed(address indexed creator, uint256 amount);
    event Settled(
        uint256 indexed id,
        bytes32 indexed batchId,
        address indexed creator,
        uint32 clicks,
        uint256 amount
    );

    /// @param usdc_ Six-decimal USDC token on the target chain.
    /// @param operator_ Trusted tracker authorized to attest and settle earned clicks.
    /// @param owner_ Administrator whose sole privileged action is rotating the operator.
    /// @param closeNotice_ Early-closure notice, between one hour and seven days inclusive.
    /// @param settleGrace_ Settlement grace after campaign expiry, between one hour and seven days inclusive.
    constructor(IERC20 usdc_, address operator_, address owner_, uint64 closeNotice_, uint64 settleGrace_)
        Ownable(owner_)
    {
        if (address(usdc_) == address(0) || operator_ == address(0)) revert ZeroAddress();
        if (
            closeNotice_ < 1 hours || closeNotice_ > 7 days
                || settleGrace_ < 1 hours || settleGrace_ > 7 days
        ) revert InvalidWindow();
        usdc = usdc_;
        operator = operator_;
        closeNotice = closeNotice_;
        settleGrace = settleGrace_;
        emit OperatorUpdated(address(0), operator_);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Replace the trusted tracker without granting access to campaign funds.
    function setOperator(address newOperator) external onlyOwner {
        if (newOperator == address(0)) revert ZeroAddress();
        address previousOperator = operator;
        operator = newOperator;
        emit OperatorUpdated(previousOperator, newOperator);
    }

    /// @notice Disabled: the administrator may only rotate the operator.
    function transferOwnership(address) public override onlyOwner {
        revert OwnershipChangesDisabled();
    }

    /// @notice Disabled to preserve the fixed administrator and operator-rotation authority.
    function renounceOwnership() public override onlyOwner {
        revert OwnershipChangesDisabled();
    }

    /// @notice Create and fund a campaign; its per-click rate cannot subsequently change.
    /// @return id Newly allocated campaign identifier, starting at one.
    function createCampaign(uint128 ratePerClick, uint128 deposit, uint64 duration)
        external
        nonReentrant
        returns (uint256 id)
    {
        return _createCampaign(ratePerClick, deposit, duration);
    }

    /// @notice Create and fund a campaign using a permit for the caller's deposit.
    /// @dev Permit failure is tolerated; transferFrom still requires sufficient allowance.
    /// @return id Newly allocated campaign identifier, starting at one.
    function createCampaignWithPermit(
        uint128 ratePerClick,
        uint128 deposit,
        uint64 duration,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (uint256 id) {
        try IERC20Permit(address(usdc)).permit(msg.sender, address(this), deposit, deadline, v, r, s) {} catch {}
        return _createCampaign(ratePerClick, deposit, duration);
    }

    /// @dev Shared creation and funding logic for both external entry points.
    function _createCampaign(uint128 ratePerClick, uint128 deposit, uint64 duration)
        internal
        returns (uint256 id)
    {
        if (ratePerClick == 0) revert InvalidRate();
        if (deposit < ratePerClick) revert InvalidDeposit();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();
        uint256 end = block.timestamp + duration;
        if (end + settleGrace > type(uint64).max) revert TimestampOverflow();

        id = ++campaignCount;
        Campaign storage campaign = _campaigns[id];
        campaign.owner = msg.sender;
        campaign.ratePerClick = ratePerClick;
        campaign.balance = deposit;
        campaign.totalDeposited = deposit;
        campaign.endsAt = uint64(end);
        campaign.unlockAt = uint64(end + settleGrace);
        ownerCampaigns[msg.sender].push(id);
        totalDepositedAll += deposit;

        emit CampaignCreated(id, msg.sender, ratePerClick, deposit, campaign.endsAt);
        usdc.safeTransferFrom(msg.sender, address(this), deposit);
    }

    /// @notice Add escrow while the campaign is active and not closing.
    function topUp(uint256 id, uint256 amount) external nonReentrant {
        _topUp(id, amount);
    }

    /// @notice Add escrow using a permit while the campaign is active and not closing.
    /// @dev Permit failure is tolerated; transferFrom still requires sufficient allowance.
    function topUpWithPermit(
        uint256 id,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        try IERC20Permit(address(usdc)).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        _topUp(id, amount);
    }

    /// @dev Shared top-up and funding logic for both external entry points.
    function _topUp(uint256 id, uint256 amount) internal {
        Campaign storage campaign = _ownedCampaign(id);
        _requireActive(campaign);
        if (amount == 0) revert InvalidAmount();

        campaign.balance += amount;
        campaign.totalDeposited += amount;
        totalDepositedAll += amount;
        emit ToppedUp(id, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Approve a new or previously revoked creator during an active campaign.
    function approveCreator(uint256 id, address creator) external {
        Campaign storage campaign = _ownedCampaign(id);
        _requireActive(campaign);
        if (creator == address(0)) revert ZeroAddress();
        if (creatorStatus[id][creator] == CreatorStatus.Approved) revert InvalidCreatorStatus();
        creatorStatus[id][creator] = CreatorStatus.Approved;
        emit CreatorApproved(id, creator);
    }

    /// @notice Stop new participation without cancelling payment rights for earned clicks.
    function revokeCreator(uint256 id, address creator) external {
        _ownedCampaign(id);
        if (creator == address(0)) revert ZeroAddress();
        if (creatorStatus[id][creator] != CreatorStatus.Approved) revert InvalidCreatorStatus();
        creatorStatus[id][creator] = CreatorStatus.Revoked;
        emit CreatorRevoked(id, creator);
    }

    /// @notice Set the informational pause flag consumed by the offchain tracker.
    function setPaused(uint256 id, bool paused) external {
        Campaign storage campaign = _ownedCampaign(id);
        campaign.paused = paused;
        emit Paused(id, paused);
    }

    /// @notice Request early closure once, shortening but never extending the escrow lock.
    function requestClose(uint256 id) external {
        Campaign storage campaign = _ownedCampaign(id);
        if (campaign.closing) revert CampaignClosing();
        campaign.closing = true;
        uint256 noticeEnd = block.timestamp + closeNotice;
        if (noticeEnd < campaign.unlockAt) campaign.unlockAt = uint64(noticeEnd);
        emit CloseRequested(id, campaign.unlockAt);
    }

    /// @notice Withdraw all remaining escrow once the settlement window has elapsed.
    function withdraw(uint256 id) external nonReentrant {
        Campaign storage campaign = _ownedCampaign(id);
        if (block.timestamp < campaign.unlockAt) revert WithdrawalLocked(campaign.unlockAt);
        uint256 amount = campaign.balance;
        if (amount == 0) revert NothingToWithdraw();
        campaign.balance = 0;
        emit Withdrawn(id, amount);
        usdc.safeTransfer(campaign.owner, amount);
    }

    /// @notice Pay a batch of earned clicks, including those of revoked creators.
    /// @dev Duplicate batch IDs revert without paying again. A failed batch rolls back
    /// its ID and all accounting. Pause, close and expiry do not gate settlement.
    /// Duplicate creator entries are permitted and their earnings are accumulated.
    /// Direct payouts are attempted immediately; reverted or false-returning transfers
    /// are deferred to claimable without undoing settlement. Settled amounts are owed
    /// amounts, including deferred payouts, and remain deducted from campaign balances.
    function settle(uint256 id, bytes32 batchId, address[] calldata creators, uint32[] calldata clicks)
        external
        onlyOperator
        nonReentrant
    {
        Campaign storage campaign = _campaign(id);
        uint256 length = creators.length;
        if (length != clicks.length) revert ArrayLengthMismatch();
        if (length == 0 || length > MAX_BATCH) revert InvalidBatchSize();
        if (usedBatch[batchId]) revert BatchAlreadyUsed();
        usedBatch[batchId] = true;

        uint256 rate = campaign.ratePerClick;
        uint256 total;
        for (uint256 i; i < length; ++i) {
            if (creatorStatus[id][creators[i]] == CreatorStatus.None) revert CreatorNotRegistered();
            if (clicks[i] == 0) revert InvalidClicks();
            total += uint256(clicks[i]) * rate;
        }
        if (total > campaign.balance) revert InsufficientBudget();

        campaign.balance -= total;
        campaign.totalPaid += total;
        totalPaidAll += total;
        // Finish every creator's accounting before the first token interaction.
        for (uint256 i; i < length; ++i) {
            uint256 amount = uint256(clicks[i]) * rate;
            earned[id][creators[i]] += amount;
            emit Settled(id, batchId, creators[i], clicks[i], amount);
        }
        for (uint256 i; i < length; ++i) {
            address creator = creators[i];
            uint256 amount = uint256(clicks[i]) * rate;
            bool paid;
            try usdc.transfer(creator, amount) returns (bool ok) {
                paid = ok;
            } catch {}
            if (!paid) {
                claimable[creator] += amount;
                emit PayoutDeferred(id, creator, amount);
            }
        }
    }

    /// @notice Claim all deferred payouts once token transfers to the caller can succeed.
    /// @dev A failed transfer reverts and preserves the caller's full claimable balance.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Return all campaign identifiers created by a business.
    function campaignsOf(address business) external view returns (uint256[] memory) {
        return ownerCampaigns[business];
    }

    /// @notice Return complete campaign state; unknown identifiers revert.
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return _campaign(id);
    }

    function _campaign(uint256 id) private view returns (Campaign storage campaign) {
        campaign = _campaigns[id];
        if (campaign.owner == address(0)) revert CampaignNotFound();
    }

    function _ownedCampaign(uint256 id) private view returns (Campaign storage campaign) {
        campaign = _campaign(id);
        if (campaign.owner != msg.sender) revert NotCampaignOwner();
    }

    function _requireActive(Campaign storage campaign) private view {
        if (campaign.closing) revert CampaignClosing();
        if (block.timestamp >= campaign.endsAt) revert CampaignEnded();
    }
}
