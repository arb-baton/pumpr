// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MemeToken.sol";
import "./MemePoolERC20Quote.sol";

/// @title MemeLaunchFactoryERC20Quote
/// @notice Launches meme tokens with bonding curves quoted in an ERC-20 asset such as USDC.
contract MemeLaunchFactoryERC20Quote {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DEFAULT_TOKEN_TRADE_FEE_BPS = 50;

    struct LaunchInfo {
        address token;
        address pool;
        address creator;
        string name;
        string symbol;
        string imageURI;
        string description;
        uint256 totalSupply;
        uint256 creatorAllocation;
        uint256 createdAt;
    }

    address public owner;
    address public feeRecipient;
    address public platformFeeRecipient;
    address public quoteToken;
    uint256 public defaultFeeBps;
    uint256 public launchFeeWei;
    uint256 public defaultVirtualQuoteReserve;
    uint256 public defaultVirtualTokenReserve;
    uint256 public defaultGraduationTargetQuote;
    address public defaultDexRouter;
    address public defaultLpRecipient;

    LaunchInfo[] private launches;
    mapping(address token => address pool) public poolByToken;

    event LaunchCreated(
        uint256 indexed launchId,
        address indexed creator,
        address indexed token,
        address pool,
        uint256 totalSupply,
        uint256 creatorAllocation,
        uint256 feeBps,
        uint256 graduationTargetEth,
        address dexRouter,
        address lpRecipient
    );
    event DefaultsUpdated(
        address feeRecipient,
        address platformFeeRecipient,
        uint256 feeBps,
        uint256 launchFeeWei,
        uint256 virtualQuoteReserve,
        uint256 virtualTokenReserve,
        uint256 graduationTargetQuote,
        address dexRouter,
        address lpRecipient
    );
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event LaunchFeePaid(address indexed payer, address indexed recipient, uint256 amountWei);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(
        address _feeRecipient,
        address _platformFeeRecipient,
        address _quoteToken,
        uint256 _defaultFeeBps,
        uint256 _launchFeeWei,
        uint256 _defaultVirtualQuoteReserve,
        uint256 _defaultVirtualTokenReserve,
        uint256 _defaultGraduationTargetQuote,
        address _defaultDexRouter
    ) {
        require(_feeRecipient != address(0), "fee recipient required");
        require(_platformFeeRecipient != address(0), "platform recipient required");
        require(_quoteToken != address(0), "quote required");
        require(_defaultFeeBps <= 300, "fee too high");
        require(_defaultVirtualQuoteReserve > 0, "virtual quote required");
        require(_defaultVirtualTokenReserve > 0, "virtual token required");
        require(_defaultGraduationTargetQuote > 0, "target required");

        owner = msg.sender;
        feeRecipient = _feeRecipient;
        platformFeeRecipient = _platformFeeRecipient;
        quoteToken = _quoteToken;
        defaultFeeBps = _defaultFeeBps;
        launchFeeWei = _launchFeeWei;
        defaultVirtualQuoteReserve = _defaultVirtualQuoteReserve;
        defaultVirtualTokenReserve = _defaultVirtualTokenReserve;
        defaultGraduationTargetQuote = _defaultGraduationTargetQuote;
        defaultDexRouter = _defaultDexRouter;
        defaultLpRecipient = _platformFeeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner required");

        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setDefaults(
        address newFeeRecipient,
        address newPlatformFeeRecipient,
        uint256 newFeeBps,
        uint256 newLaunchFeeWei,
        uint256 newVirtualQuoteReserve,
        uint256 newVirtualTokenReserve,
        uint256 newGraduationTargetQuote,
        address newDexRouter,
        address newLpRecipient
    ) external onlyOwner {
        require(newFeeRecipient != address(0), "fee recipient required");
        require(newPlatformFeeRecipient != address(0), "platform recipient required");
        require(newFeeBps <= 300, "fee too high");
        require(newVirtualQuoteReserve > 0, "virtual quote required");
        require(newVirtualTokenReserve > 0, "virtual token required");
        require(newGraduationTargetQuote > 0, "target required");

        if (newDexRouter != address(0)) {
            require(newLpRecipient != address(0), "lp recipient required");
        }

        feeRecipient = newFeeRecipient;
        platformFeeRecipient = newPlatformFeeRecipient;
        defaultFeeBps = newFeeBps;
        launchFeeWei = newLaunchFeeWei;
        defaultVirtualQuoteReserve = newVirtualQuoteReserve;
        defaultVirtualTokenReserve = newVirtualTokenReserve;
        defaultGraduationTargetQuote = newGraduationTargetQuote;
        defaultDexRouter = newDexRouter;
        defaultLpRecipient = newLpRecipient;

        emit DefaultsUpdated(
            newFeeRecipient,
            newPlatformFeeRecipient,
            newFeeBps,
            newLaunchFeeWei,
            newVirtualQuoteReserve,
            newVirtualTokenReserve,
            newGraduationTargetQuote,
            newDexRouter,
            newLpRecipient
        );
    }

    function createLaunch(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value == launchFeeWei, "launch fee mismatch");
        _collectLaunchFee();
        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps
        );
    }

    function _createLaunch(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps
    ) internal returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(bytes(name).length > 0, "name required");
        require(bytes(symbol).length > 0, "symbol required");
        require(totalSupply > 0, "supply required");
        require(creatorAllocationBps <= 2_000, "allocation too high");

        MemeToken token = new MemeToken(
            name,
            symbol,
            totalSupply,
            address(this),
            msg.sender,
            platformFeeRecipient,
            DEFAULT_TOKEN_TRADE_FEE_BPS
        );
        bool isPlatformCreator = msg.sender == platformFeeRecipient;
        address launchLpRecipient = isPlatformCreator ? platformFeeRecipient : defaultLpRecipient;
        if (defaultDexRouter != address(0)) {
            require(launchLpRecipient != address(0), "lp recipient required");
        }

        MemePoolERC20Quote pool = new MemePoolERC20Quote(address(token), quoteToken);
        pool.initialize(
            feeRecipient,
            defaultFeeBps,
            defaultVirtualQuoteReserve,
            defaultVirtualTokenReserve,
            defaultGraduationTargetQuote,
            defaultDexRouter,
            launchLpRecipient
        );

        uint256 creatorAllocation = (totalSupply * creatorAllocationBps) / BPS_DENOMINATOR;
        uint256 poolAllocation = totalSupply - creatorAllocation;

        require(token.transfer(address(pool), poolAllocation), "pool transfer failed");

        if (creatorAllocation > 0) {
            require(token.transfer(msg.sender, creatorAllocation), "creator transfer failed");
        }

        pool.seed(poolAllocation);

        tokenAddress = address(token);
        poolAddress = address(pool);

        poolByToken[tokenAddress] = poolAddress;

        launchId = launches.length;
        launches.push();

        LaunchInfo storage info = launches[launchId];
        info.token = tokenAddress;
        info.pool = poolAddress;
        info.creator = msg.sender;
        info.name = name;
        info.symbol = symbol;
        info.imageURI = imageURI;
        info.description = description;
        info.totalSupply = totalSupply;
        info.creatorAllocation = creatorAllocation;
        info.createdAt = block.timestamp;

        emit LaunchCreated(
            launchId,
            msg.sender,
            tokenAddress,
            poolAddress,
            totalSupply,
            creatorAllocation,
            defaultFeeBps,
            defaultGraduationTargetQuote,
            defaultDexRouter,
            launchLpRecipient
        );
    }

    function _collectLaunchFee() internal {
        if (launchFeeWei == 0) {
            return;
        }
        require(platformFeeRecipient != address(0), "platform recipient required");
        (bool ok, ) = platformFeeRecipient.call{value: launchFeeWei}("");
        require(ok, "launch fee transfer failed");
        emit LaunchFeePaid(msg.sender, platformFeeRecipient, launchFeeWei);
    }

    function getLaunchCount() external view returns (uint256) {
        return launches.length;
    }

    function getLaunch(uint256 launchId) external view returns (LaunchInfo memory) {
        require(launchId < launches.length, "launch not found");
        return launches[launchId];
    }

    receive() external payable {}
}
