// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMemeTokenDeployer {
    function deployToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        address factory,
        address creator,
        address platformFeeRecipient,
        uint256 tradeFeeBps
    ) external returns (address);
}

interface IMemePoolDeployer {
    function deployPool(
        address token,
        address factory,
        address feeRecipient,
        uint256 feeBps,
        uint256 virtualEthReserve,
        uint256 virtualTokenReserve,
        uint256 graduationTargetEth,
        address dexRouter,
        address lpRecipient,
        address v3PositionManager,
        uint24 v3Fee
    ) external returns (address);
}

interface IMemeTokenMinimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function setDexPair(address pair) external;
    function renounceFactoryControl() external;
    function creatorFeeBps() external view returns (uint256);
    function platformFeeBps() external view returns (uint256);
}

interface IMemePoolMinimal {
    function seed(uint256 tokenLiquidity) external;
    function launchLiveDexCurveV3() external;
    function migratedPair() external view returns (address);
}

/// @notice Compact Robinhood-only factory for zero-seed Uniswap V3 live bonding launches.
contract MemeLaunchFactoryRobinhoodV3 {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant FIXED_TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant MAX_TOKEN_TRADE_FEE_BPS = 1_000;

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
    uint256 public defaultFeeBps;
    uint256 public launchFeeWei;
    uint256 public defaultVirtualEthReserve;
    uint256 public defaultVirtualTokenReserve;
    uint256 public defaultGraduationTargetEth;
    address public defaultDexRouter;
    address public defaultLpRecipient;
    address public defaultV3PositionManager;
    uint24 public defaultV3Fee;
    address public immutable tokenDeployer;
    address public immutable poolDeployer;

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
        address lpRecipient,
        address v3PositionManager,
        uint24 v3Fee
    );
    event LaunchFeePaid(address indexed payer, address indexed recipient, uint256 amountWei);
    event LiveDexCurveRequested(address indexed creator, uint256 ethLiquidity);
    event TokenTaxConfigured(
        uint256 indexed launchId,
        address indexed token,
        uint256 tradeFeeBps,
        uint256 creatorFeeBps,
        uint256 platformFeeBps
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(
        address _feeRecipient,
        address _platformFeeRecipient,
        uint256 _defaultFeeBps,
        uint256 _launchFeeWei,
        uint256 _defaultVirtualEthReserve,
        uint256 _defaultVirtualTokenReserve,
        uint256 _defaultGraduationTargetEth,
        address _defaultDexRouter,
        address _defaultLpRecipient,
        address _defaultV3PositionManager,
        uint24 _defaultV3Fee,
        address _tokenDeployer,
        address _poolDeployer
    ) {
        require(_feeRecipient != address(0), "fee recipient required");
        require(_platformFeeRecipient != address(0), "platform recipient required");
        require(_defaultFeeBps <= 300, "fee too high");
        require(_defaultVirtualEthReserve > 0, "virtual eth required");
        require(_defaultVirtualTokenReserve > 0, "virtual token required");
        require(_defaultGraduationTargetEth > 0, "target required");
        require(_defaultV3PositionManager != address(0), "v3 manager required");
        require(_tokenDeployer != address(0), "token deployer required");
        require(_poolDeployer != address(0), "pool deployer required");

        owner = msg.sender;
        feeRecipient = _feeRecipient;
        platformFeeRecipient = _platformFeeRecipient;
        defaultFeeBps = _defaultFeeBps;
        launchFeeWei = _launchFeeWei;
        defaultVirtualEthReserve = _defaultVirtualEthReserve;
        defaultVirtualTokenReserve = _defaultVirtualTokenReserve;
        defaultGraduationTargetEth = _defaultGraduationTargetEth;
        defaultDexRouter = _defaultDexRouter;
        defaultLpRecipient = _defaultLpRecipient;
        defaultV3PositionManager = _defaultV3PositionManager;
        defaultV3Fee = _defaultV3Fee == 0 ? 10_000 : _defaultV3Fee;
        tokenDeployer = _tokenDeployer;
        poolDeployer = _poolDeployer;
    }

    function createLaunchLiveDexCurveWithTax(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value == launchFeeWei, "launch fee mismatch");
        return _createV3Launch(name, symbol, imageURI, description, creatorAllocationBps, tokenTradeFeeBps);
    }

    function createLaunchLiveDexCurve(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256,
        uint256 creatorAllocationBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value == launchFeeWei, "launch fee mismatch");
        return _createV3Launch(name, symbol, imageURI, description, creatorAllocationBps, 50);
    }

    function getLaunchCount() external view returns (uint256) {
        return launches.length;
    }

    function getLaunch(uint256 launchId) external view returns (LaunchInfo memory) {
        require(launchId < launches.length, "invalid launch id");
        return launches[launchId];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "owner required");
        owner = newOwner;
    }

    function _createV3Launch(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps
    ) internal returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(bytes(name).length > 0, "name required");
        require(bytes(symbol).length > 0, "symbol required");
        require(creatorAllocationBps <= 2_000, "allocation too high");
        require(tokenTradeFeeBps <= MAX_TOKEN_TRADE_FEE_BPS, "trade fee too high");

        _collectLaunchFee();
        emit LiveDexCurveRequested(msg.sender, 0);

        IMemeTokenMinimal token = IMemeTokenMinimal(IMemeTokenDeployer(tokenDeployer).deployToken(
            name,
            symbol,
            FIXED_TOTAL_SUPPLY,
            address(this),
            msg.sender,
            platformFeeRecipient,
            tokenTradeFeeBps
        ));
        IMemePoolMinimal pool = IMemePoolMinimal(IMemePoolDeployer(poolDeployer).deployPool(
            address(token),
            address(this),
            feeRecipient,
            defaultFeeBps,
            defaultVirtualEthReserve,
            defaultVirtualTokenReserve,
            defaultGraduationTargetEth,
            defaultDexRouter,
            defaultLpRecipient,
            defaultV3PositionManager,
            defaultV3Fee
        ));

        uint256 creatorAllocation = (FIXED_TOTAL_SUPPLY * creatorAllocationBps) / BPS_DENOMINATOR;
        uint256 poolAllocation = FIXED_TOTAL_SUPPLY - creatorAllocation;

        require(token.transfer(address(pool), poolAllocation), "pool transfer failed");
        if (creatorAllocation > 0) {
            require(token.transfer(msg.sender, creatorAllocation), "creator transfer failed");
        }

        pool.seed(poolAllocation);
        pool.launchLiveDexCurveV3();

        address pair = pool.migratedPair();
        if (pair != address(0)) {
            token.setDexPair(pair);
        }
        token.renounceFactoryControl();

        tokenAddress = address(token);
        poolAddress = address(pool);
        poolByToken[tokenAddress] = poolAddress;

        launchId = launches.length;
        launches.push(
            LaunchInfo({
                token: tokenAddress,
                pool: poolAddress,
                creator: msg.sender,
                name: name,
                symbol: symbol,
                imageURI: imageURI,
                description: description,
                totalSupply: FIXED_TOTAL_SUPPLY,
                creatorAllocation: creatorAllocation,
                createdAt: block.timestamp
            })
        );

        emit LaunchCreated(
            launchId,
            msg.sender,
            tokenAddress,
            poolAddress,
            FIXED_TOTAL_SUPPLY,
            creatorAllocation,
            defaultFeeBps,
            defaultGraduationTargetEth,
            defaultDexRouter,
            defaultLpRecipient,
            defaultV3PositionManager,
            defaultV3Fee
        );
        emit TokenTaxConfigured(launchId, tokenAddress, tokenTradeFeeBps, token.creatorFeeBps(), token.platformFeeBps());
    }

    function _collectLaunchFee() internal {
        if (launchFeeWei == 0) return;
        (bool sent, ) = platformFeeRecipient.call{value: launchFeeWei}("");
        require(sent, "launch fee transfer failed");
        emit LaunchFeePaid(msg.sender, platformFeeRecipient, launchFeeWei);
    }
}
