// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MemeToken.sol";
import "./MemePool.sol";

/// @title MemeLaunchFactory
/// @notice Launches meme tokens with bonding-curve pools and auto DEX graduation.
contract MemeLaunchFactory {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DEFAULT_TOKEN_TRADE_FEE_BPS = 50;
    uint256 public constant MAX_TOKEN_TRADE_FEE_BPS = 1_000;
    uint256 public constant ROBINHOOD_CHAIN_ID = 4663;
    uint256 public constant FIXED_TOTAL_SUPPLY = 1_000_000_000 ether;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;

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

    // Graduation defaults (pump-style auto migration)
    uint256 public defaultGraduationTargetEth;
    address public defaultDexRouter;
    address public defaultLpRecipient;
    address public defaultV3PositionManager;
    uint24 public defaultV3Fee;

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

    event DefaultsUpdated(
        address feeRecipient,
        address platformFeeRecipient,
        uint256 feeBps,
        uint256 launchFeeWei,
        uint256 virtualEthReserve,
        uint256 virtualTokenReserve,
        uint256 graduationTargetEth,
        address dexRouter,
        address lpRecipient,
        address v3PositionManager,
        uint24 v3Fee
    );

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event InstantLaunchRequested(address indexed creator, uint256 ethLiquidity);
    event LiveDexCurveRequested(address indexed creator, uint256 ethLiquidity);
    event LaunchFeePaid(address indexed payer, address indexed recipient, uint256 amountWei);
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
        uint24 _defaultV3Fee
    ) {
        require(_feeRecipient != address(0), "fee recipient required");
        require(_defaultFeeBps <= 300, "fee too high");
        require(_platformFeeRecipient != address(0), "platform recipient required");
        require(_defaultVirtualEthReserve > 0, "virtual eth required");
        require(_defaultVirtualTokenReserve > 0, "virtual token required");
        require(_defaultGraduationTargetEth > 0, "target required");

        if (_defaultDexRouter != address(0)) {
            require(_defaultLpRecipient != address(0), "lp recipient required");
        }

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
        uint256 newVirtualEthReserve,
        uint256 newVirtualTokenReserve,
        uint256 newGraduationTargetEth,
        address newDexRouter,
        address newLpRecipient,
        address newV3PositionManager,
        uint24 newV3Fee
    ) external onlyOwner {
        require(newFeeRecipient != address(0), "fee recipient required");
        require(newPlatformFeeRecipient != address(0), "platform recipient required");
        require(newFeeBps <= 300, "fee too high");
        require(newVirtualEthReserve > 0, "virtual eth required");
        require(newVirtualTokenReserve > 0, "virtual token required");
        require(newGraduationTargetEth > 0, "target required");

        if (newDexRouter != address(0)) {
            require(newLpRecipient != address(0), "lp recipient required");
        }

        feeRecipient = newFeeRecipient;
        platformFeeRecipient = newPlatformFeeRecipient;
        defaultFeeBps = newFeeBps;
        launchFeeWei = newLaunchFeeWei;
        defaultVirtualEthReserve = newVirtualEthReserve;
        defaultVirtualTokenReserve = newVirtualTokenReserve;
        defaultGraduationTargetEth = newGraduationTargetEth;
        defaultDexRouter = newDexRouter;
        defaultLpRecipient = newLpRecipient;
        defaultV3PositionManager = newV3PositionManager;
        defaultV3Fee = newV3Fee == 0 ? 10_000 : newV3Fee;

        emit DefaultsUpdated(
            newFeeRecipient,
            newPlatformFeeRecipient,
            newFeeBps,
            newLaunchFeeWei,
            newVirtualEthReserve,
            newVirtualTokenReserve,
            newGraduationTargetEth,
            newDexRouter,
            newLpRecipient,
            newV3PositionManager,
            defaultV3Fee
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
            creatorAllocationBps,
            DEFAULT_TOKEN_TRADE_FEE_BPS,
            0,
            false,
            false,
            false
        );
    }

    function createLaunchWithTax(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value == launchFeeWei, "launch fee mismatch");
        _collectLaunchFee();
        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps,
            tokenTradeFeeBps,
            0,
            false,
            false,
            false
        );
    }

    /// @notice Launch live on Uniswap immediately while keeping a graduation target on the live pair.
    function createLaunchLiveDexCurve(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value >= launchFeeWei, "insufficient launch fee");

        uint256 initialLiquidity = msg.value - launchFeeWei;
        bool useV3 = initialLiquidity == 0 && defaultV3PositionManager != address(0);
        if (!useV3) {
            require(defaultDexRouter != address(0), "dex router not set");
            require(defaultLpRecipient != address(0), "lp recipient not set");
            require(initialLiquidity > 0, "insufficient eth for fee+liquidity");
        }
        _collectLaunchFee();

        emit LiveDexCurveRequested(msg.sender, initialLiquidity);

        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps,
            DEFAULT_TOKEN_TRADE_FEE_BPS,
            initialLiquidity,
            false,
            !useV3,
            useV3
        );
    }

    function createLaunchLiveDexCurveWithTax(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(msg.value >= launchFeeWei, "insufficient launch fee");

        uint256 initialLiquidity = msg.value - launchFeeWei;
        bool useV3 = initialLiquidity == 0 && defaultV3PositionManager != address(0);
        if (!useV3) {
            require(defaultDexRouter != address(0), "dex router not set");
            require(defaultLpRecipient != address(0), "lp recipient not set");
            require(initialLiquidity > 0, "insufficient eth for fee+liquidity");
        }
        _collectLaunchFee();

        emit LiveDexCurveRequested(msg.sender, initialLiquidity);

        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps,
            tokenTradeFeeBps,
            initialLiquidity,
            false,
            !useV3,
            useV3
        );
    }

    /// @notice Klik-style launch: deploy and migrate directly to Uniswap using provided ETH.
    function createLaunchInstant(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(defaultDexRouter != address(0), "dex router not set");
        require(defaultLpRecipient != address(0), "lp recipient not set");
        require(msg.value > launchFeeWei, "insufficient eth for fee+liquidity");

        uint256 initialLiquidity = msg.value - launchFeeWei;
        _collectLaunchFee();

        emit InstantLaunchRequested(msg.sender, initialLiquidity);

        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps,
            DEFAULT_TOKEN_TRADE_FEE_BPS,
            initialLiquidity,
            true,
            false,
            false
        );
    }

    function createLaunchInstantWithTax(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps
    ) external payable returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(defaultDexRouter != address(0), "dex router not set");
        require(defaultLpRecipient != address(0), "lp recipient not set");
        require(msg.value > launchFeeWei, "insufficient eth for fee+liquidity");

        uint256 initialLiquidity = msg.value - launchFeeWei;
        _collectLaunchFee();

        emit InstantLaunchRequested(msg.sender, initialLiquidity);

        (launchId, tokenAddress, poolAddress) = _createLaunch(
            name,
            symbol,
            imageURI,
            description,
            totalSupply,
            creatorAllocationBps,
            tokenTradeFeeBps,
            initialLiquidity,
            true,
            false,
            false
        );
    }

    function _createLaunch(
        string calldata name,
        string calldata symbol,
        string calldata imageURI,
        string calldata description,
        uint256 totalSupply,
        uint256 creatorAllocationBps,
        uint256 tokenTradeFeeBps,
        uint256 initialEthLiquidity,
        bool graduateNow,
        bool openLiveDexCurve,
        bool openLiveDexCurveV3
    ) internal returns (uint256 launchId, address tokenAddress, address poolAddress) {
        require(bytes(name).length > 0, "name required");
        require(bytes(symbol).length > 0, "symbol required");
        totalSupply = FIXED_TOTAL_SUPPLY;
        require(creatorAllocationBps <= 2_000, "allocation too high");
        require(tokenTradeFeeBps <= MAX_TOKEN_TRADE_FEE_BPS, "trade fee too high");

        MemeToken token = new MemeToken(name, symbol, totalSupply, address(this), msg.sender, platformFeeRecipient, tokenTradeFeeBps);
        bool isPlatformCreator = msg.sender == platformFeeRecipient;
        address launchLpRecipient = _resolveLaunchLpRecipient(isPlatformCreator);

        MemePool pool = new MemePool{value: initialEthLiquidity}(
            address(token),
            address(this),
            feeRecipient,
            defaultFeeBps,
            defaultVirtualEthReserve,
            defaultVirtualTokenReserve,
            defaultGraduationTargetEth,
            defaultDexRouter,
            launchLpRecipient,
            defaultV3PositionManager,
            defaultV3Fee
        );

        uint256 creatorAllocation = (totalSupply * creatorAllocationBps) / BPS_DENOMINATOR;
        uint256 poolAllocation = totalSupply - creatorAllocation;

        require(token.transfer(address(pool), poolAllocation), "pool transfer failed");

        if (creatorAllocation > 0) {
            require(token.transfer(msg.sender, creatorAllocation), "creator transfer failed");
        }

        pool.seed(poolAllocation);
        if (graduateNow) {
            pool.graduateNow();
            address pair = pool.migratedPair();
            if (pair != address(0)) {
                token.setDexPair(pair);
            }
            if (!isPlatformCreator || block.chainid == ROBINHOOD_CHAIN_ID) {
                token.renounceFactoryControl();
            }
        } else if (openLiveDexCurve) {
            pool.launchLiveDexCurve();
            address pair = pool.migratedPair();
            if (pair != address(0)) {
                token.setDexPair(pair);
            }
            if (!isPlatformCreator || block.chainid == ROBINHOOD_CHAIN_ID) {
                token.renounceFactoryControl();
            }
        } else if (openLiveDexCurveV3) {
            pool.launchLiveDexCurveV3();
            address pair = pool.migratedPair();
            if (pair != address(0)) {
                token.setDexPair(pair);
            }
            if (!isPlatformCreator || block.chainid == ROBINHOOD_CHAIN_ID) {
                token.renounceFactoryControl();
            }
        }

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
            defaultGraduationTargetEth,
            defaultDexRouter,
            launchLpRecipient,
            defaultV3PositionManager,
            defaultV3Fee
        );
        emit TokenTaxConfigured(
            launchId,
            tokenAddress,
            tokenTradeFeeBps,
            token.creatorFeeBps(),
            token.platformFeeBps()
        );
    }

    function _resolveLaunchLpRecipient(bool isPlatformCreator) internal view returns (address) {
        if (defaultDexRouter == address(0)) {
            return defaultLpRecipient;
        }
        if (block.chainid == ROBINHOOD_CHAIN_ID) {
            return BURN_ADDRESS;
        }
        if (isPlatformCreator) {
            return defaultLpRecipient;
        }
        return BURN_ADDRESS;
    }

    function getLaunchCount() external view returns (uint256) {
        return launches.length;
    }

    function getLaunch(uint256 launchId) external view returns (LaunchInfo memory) {
        require(launchId < launches.length, "invalid launch id");
        return launches[launchId];
    }

    function getLaunches(uint256 offset, uint256 limit) external view returns (LaunchInfo[] memory data) {
        uint256 total = launches.length;
        if (offset >= total) {
            return new LaunchInfo[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        data = new LaunchInfo[](end - offset);
        uint256 cursor = 0;

        for (uint256 i = offset; i < end; i++) {
            data[cursor] = launches[i];
            cursor++;
        }
    }

    function _collectLaunchFee() internal {
        require(msg.value >= launchFeeWei, "insufficient launch fee");
        if (launchFeeWei == 0) {
            return;
        }
        (bool sent, ) = platformFeeRecipient.call{value: launchFeeWei}("");
        require(sent, "launch fee transfer failed");
        emit LaunchFeePaid(msg.sender, platformFeeRecipient, launchFeeWei);
    }
}
