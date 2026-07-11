// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function burn(uint256 amount) external returns (bool);
}

interface IUniswapV2RouterLike {
    function WETH() external view returns (address);
    function factory() external view returns (address);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}

interface IUniswapV2FactoryLike {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2PairLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

interface IUniswapV3PositionManagerLike {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function WETH9() external view returns (address);
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IUniswapV3PoolLike {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @title MemePool
/// @notice Bonding-curve pool that auto-migrates liquidity to DEX at graduation threshold.
contract MemePool {
    uint256 public constant BPS_DENOMINATOR = 10_000;
    address public constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint160 private constant MIN_SQRT_RATIO_PLUS_ONE = 4_295_128_740;
    uint160 private constant MAX_SQRT_RATIO_MINUS_ONE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_341;
    int24 private constant MIN_USABLE_TICK_1_PERCENT = -887_200;
    int24 private constant MAX_USABLE_TICK_1_PERCENT = 887_200;
    int24 private constant START_TICK_TOKEN0 = -211_200;
    int24 private constant START_TICK_TOKEN1 = 211_200;
    uint160 private constant START_SQRT_PRICE_TOKEN0 = 2_055_697_212_782_694_920_257_830;
    uint160 private constant START_SQRT_PRICE_TOKEN1 = 3_053_514_737_654_229_152_956_308_097_490_832;
    uint256 private constant Q192 = 2 ** 192;

    address public immutable factory;
    address public immutable token;
    address public feeRecipient;

    uint256 public feeBps;
    uint256 public ethReserve;
    uint256 public tokenReserve;
    uint256 public immutable virtualEthReserve;
    uint256 public immutable virtualTokenReserve;

    // Graduation / migration config
    uint256 public graduationTargetEth;
    address public dexRouter;
    address public lpRecipient;
    address public v3PositionManager;
    uint24 public v3Fee;

    bool public seeded;
    bool public graduated;
    bool public liveDexCurve;
    bool public liveDexCurveV3;
    bool public migratedDexV3;
    bool private locked;

    address public migratedPair;
    uint256 public v3TokenId;
    uint256 public graduatedAt;

    event PoolSeeded(uint256 tokenLiquidity);
    event Buy(address indexed buyer, uint256 ethIn, uint256 feePaid, uint256 tokensOut);
    event Sell(address indexed seller, uint256 tokensIn, uint256 ethOut, uint256 feePaid);
    event FeeConfigUpdated(address indexed recipient, uint256 feeBps);
    event MigrationConfigUpdated(address dexRouter, address lpRecipient, uint256 graduationTargetEth);
    event Graduated(
        address indexed pair,
        uint256 tokenMigrated,
        uint256 ethMigrated,
        uint256 lpMinted,
        uint256 timestamp
    );
    event DexCurveOpened(
        address indexed pair,
        uint256 tokenMigrated,
        uint256 ethMigrated,
        uint256 lpMinted,
        uint256 timestamp
    );
    event DexCurveCompleted(
        address indexed pair,
        uint256 quoteReserve,
        uint256 lpBurned,
        uint256 tokenSupplyBurned,
        uint256 timestamp
    );
    event InstantGraduationTriggered(address indexed caller, uint256 ethReserve, uint256 tokenReserve);

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "reentrancy");
        locked = true;
        _;
        locked = false;
    }

    constructor(
        address _token,
        address _factory,
        address _feeRecipient,
        uint256 _feeBps,
        uint256 _virtualEthReserve,
        uint256 _virtualTokenReserve,
        uint256 _graduationTargetEth,
        address _dexRouter,
        address _lpRecipient,
        address _v3PositionManager,
        uint24 _v3Fee
    ) payable {
        require(_token != address(0), "token required");
        require(_factory != address(0), "factory required");
        require(_feeRecipient != address(0), "fee recipient required");
        require(_feeBps <= 300, "fee too high");
        require(_virtualEthReserve > 0, "virtual eth required");
        require(_virtualTokenReserve > 0, "virtual token required");
        require(_graduationTargetEth > 0, "target required");

        if (_dexRouter != address(0)) {
            require(_lpRecipient != address(0), "lp recipient required");
        }

        token = _token;
        factory = _factory;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        virtualEthReserve = _virtualEthReserve;
        virtualTokenReserve = _virtualTokenReserve;

        graduationTargetEth = _graduationTargetEth;
        dexRouter = _dexRouter;
        lpRecipient = _lpRecipient;
        v3PositionManager = _v3PositionManager;
        v3Fee = _v3Fee == 0 ? 10_000 : _v3Fee;
        ethReserve = msg.value;
    }

    function seed(uint256 tokenAmount) external onlyFactory {
        require(!seeded, "already seeded");
        require(tokenAmount > 0, "token amount required");
        require(IERC20(token).balanceOf(address(this)) >= tokenAmount, "insufficient tokens");

        seeded = true;
        tokenReserve = tokenAmount;

        emit PoolSeeded(tokenAmount);
    }

    function configureFees(address newRecipient, uint256 newFeeBps) external onlyFactory {
        require(newRecipient != address(0), "recipient required");
        require(newFeeBps <= 300, "fee too high");

        feeRecipient = newRecipient;
        feeBps = newFeeBps;

        emit FeeConfigUpdated(newRecipient, newFeeBps);
    }

    function configureMigration(address newDexRouter, address newLpRecipient, uint256 newTargetEth) external onlyFactory {
        require(!graduated, "already graduated");
        require(newTargetEth > 0, "target required");

        if (newDexRouter != address(0)) {
            require(newLpRecipient != address(0), "lp recipient required");
        }

        dexRouter = newDexRouter;
        lpRecipient = newLpRecipient;
        graduationTargetEth = newTargetEth;

        emit MigrationConfigUpdated(newDexRouter, newLpRecipient, newTargetEth);
    }

    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        require(seeded, "pool not seeded");
        require(!graduated, "graduated");
        require(!liveDexCurve, "dex curve live");
        require(msg.value > 0, "eth required");

        uint256 feePaid = (msg.value * feeBps) / BPS_DENOMINATOR;
        uint256 netEthIn = msg.value - feePaid;
        tokensOut = _getBuyQuoteFromNetEth(netEthIn);

        require(tokensOut > 0, "insufficient output");
        require(tokensOut >= minTokensOut, "slippage");
        require(tokensOut <= tokenReserve, "insufficient liquidity");

        ethReserve += netEthIn;
        tokenReserve -= tokensOut;

        if (feePaid > 0) {
            (bool feeOk, ) = feeRecipient.call{value: feePaid}("");
            require(feeOk, "fee transfer failed");
        }

        bool transferred = IERC20(token).transfer(msg.sender, tokensOut);
        require(transferred, "token transfer failed");

        emit Buy(msg.sender, msg.value, feePaid, tokensOut);

        _tryAutoGraduate();
    }

    function sell(uint256 tokenAmountIn, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        require(seeded, "pool not seeded");
        require(!graduated, "graduated");
        require(!liveDexCurve, "dex curve live");
        require(tokenAmountIn > 0, "token amount required");

        uint256 grossEthOut = _getSellQuoteGross(tokenAmountIn);
        require(grossEthOut > 0, "insufficient output");
        require(grossEthOut <= ethReserve, "insufficient eth reserve");

        uint256 feePaid = (grossEthOut * feeBps) / BPS_DENOMINATOR;
        ethOut = grossEthOut - feePaid;

        require(ethOut >= minEthOut, "slippage");

        bool pulled = IERC20(token).transferFrom(msg.sender, address(this), tokenAmountIn);
        require(pulled, "token transfer failed");

        tokenReserve += tokenAmountIn;
        ethReserve -= grossEthOut;

        (bool sentToSeller, ) = msg.sender.call{value: ethOut}("");
        require(sentToSeller, "eth transfer failed");

        if (feePaid > 0) {
            (bool sentFee, ) = feeRecipient.call{value: feePaid}("");
            require(sentFee, "fee transfer failed");
        }

        emit Sell(msg.sender, tokenAmountIn, ethOut, feePaid);
    }

    /// @notice Allows anyone to trigger migration if target is reached.
    function triggerGraduation() external nonReentrant {
        require(seeded, "pool not seeded");
        require(!graduated, "already graduated");
        if (liveDexCurve) {
            uint256 quoteReserve = _getDexQuoteReserve();
            require(quoteReserve >= graduationTargetEth, "target not reached");
            _completeDexCurve(quoteReserve);
            return;
        }

        require(ethReserve >= graduationTargetEth, "target not reached");
        _graduateToDex();
    }

    /// @notice Factory-only path to skip bonding curve and migrate immediately to DEX.
    function graduateNow() external onlyFactory nonReentrant {
        require(seeded, "pool not seeded");
        require(!graduated, "already graduated");
        require(!liveDexCurve, "dex curve live");
        require(ethReserve > 0, "no eth reserve");

        emit InstantGraduationTriggered(msg.sender, ethReserve, tokenReserve);
        _graduateToDex();
    }

    /// @notice Factory-only path to seed Uniswap immediately but keep a live graduation target on the pair.
    function launchLiveDexCurve() external onlyFactory nonReentrant {
        require(seeded, "pool not seeded");
        require(!graduated, "already graduated");
        require(!liveDexCurve, "dex curve live");
        require(ethReserve > 0, "no eth reserve");
        require(dexRouter != address(0), "dex router not set");

        _openDexCurve();
    }

    /// @notice Factory-only path to open a Uniswap V3 single-sided live curve with no creator ETH seed.
    function launchLiveDexCurveV3() external onlyFactory nonReentrant {
        require(seeded, "pool not seeded");
        require(!graduated, "already graduated");
        require(!liveDexCurve, "dex curve live");
        require(ethReserve == 0, "eth reserve not supported");
        require(v3PositionManager != address(0), "v3 manager not set");

        _openDexCurveV3();
    }

    function quoteBuy(uint256 ethAmountIn) external view returns (uint256 tokensOut, uint256 feePaid) {
        if (!seeded || graduated || liveDexCurve || ethAmountIn == 0) {
            return (0, 0);
        }

        feePaid = (ethAmountIn * feeBps) / BPS_DENOMINATOR;
        uint256 netEth = ethAmountIn - feePaid;
        tokensOut = _getBuyQuoteFromNetEth(netEth);
    }

    function quoteSell(uint256 tokenAmountIn) external view returns (uint256 ethOut, uint256 feePaid) {
        if (!seeded || graduated || liveDexCurve || tokenAmountIn == 0) {
            return (0, 0);
        }

        uint256 grossEthOut = _getSellQuoteGross(tokenAmountIn);
        if (grossEthOut == 0) {
            return (0, 0);
        }

        feePaid = (grossEthOut * feeBps) / BPS_DENOMINATOR;
        ethOut = grossEthOut - feePaid;
    }

    /// @notice Spot ETH/token price scaled by 1e18.
    function spotPrice() external view returns (uint256) {
        if ((liveDexCurve || graduated) && migratedPair != address(0)) {
            return _getDexSpotPrice();
        }

        uint256 y = tokenReserve + virtualTokenReserve;
        if (y == 0) {
            return 0;
        }

        uint256 x = ethReserve + virtualEthReserve;
        return (x * 1e18) / y;
    }

    function targetProgressBps() external view returns (uint256) {
        if (graduationTargetEth == 0) {
            return 0;
        }

        uint256 baseReserve = (liveDexCurve || (graduated && migratedPair != address(0))) ? _getDexQuoteReserve() : ethReserve;
        uint256 progress = (baseReserve * BPS_DENOMINATOR) / graduationTargetEth;
        if (progress > BPS_DENOMINATOR) {
            return BPS_DENOMINATOR;
        }

        return progress;
    }

    function _tryAutoGraduate() internal {
        if (graduated || liveDexCurve) {
            return;
        }

        if (ethReserve < graduationTargetEth) {
            return;
        }

        _graduateToDex();
    }

    function _graduateToDex() internal {
        require(dexRouter != address(0), "dex router not set");

        graduated = true;
        graduatedAt = block.timestamp;

        (uint256 tokenUsed, uint256 ethUsed, uint256 lpMinted, address pair, ) = _addLiquidityToDex(
            lpRecipient,
            true
        );
        migratedPair = pair;

        emit Graduated(pair, tokenUsed, ethUsed, lpMinted, block.timestamp);
    }

    function _openDexCurve() internal {
        (uint256 tokenUsed, uint256 ethUsed, uint256 lpMinted, address pair, ) = _addLiquidityToDex(address(this), true);
        liveDexCurve = true;
        liveDexCurveV3 = false;
        migratedDexV3 = false;
        migratedPair = pair;

        emit DexCurveOpened(pair, tokenUsed, ethUsed, lpMinted, block.timestamp);

        uint256 quoteReserve = _getDexQuoteReserve();
        if (quoteReserve >= graduationTargetEth) {
            _completeDexCurve(quoteReserve);
        }
    }

    function _openDexCurveV3() internal {
        uint256 tokensToMigrate = tokenReserve;
        tokenReserve = 0;

        IUniswapV3PositionManagerLike manager = IUniswapV3PositionManagerLike(v3PositionManager);
        address weth = manager.WETH9();
        bool tokenIsToken0 = token < weth;
        address token0 = tokenIsToken0 ? token : weth;
        address token1 = tokenIsToken0 ? weth : token;
        uint160 sqrtPriceX96 = tokenIsToken0 ? START_SQRT_PRICE_TOKEN0 : START_SQRT_PRICE_TOKEN1;
        int24 tickLower = tokenIsToken0 ? START_TICK_TOKEN0 : MIN_USABLE_TICK_1_PERCENT;
        int24 tickUpper = tokenIsToken0 ? MAX_USABLE_TICK_1_PERCENT : START_TICK_TOKEN1;

        address pool = manager.createAndInitializePoolIfNecessary(token0, token1, v3Fee, sqrtPriceX96);

        IERC20(token).approve(v3PositionManager, 0);
        IERC20(token).approve(v3PositionManager, tokensToMigrate);

        uint256 amount0Desired = tokenIsToken0 ? tokensToMigrate : 0;
        uint256 amount1Desired = tokenIsToken0 ? 0 : tokensToMigrate;
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = manager.mint(
            IUniswapV3PositionManagerLike.MintParams({
                token0: token0,
                token1: token1,
                fee: v3Fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp + 1 hours
            })
        );

        uint256 tokenUsed = tokenIsToken0 ? amount0 : amount1;
        if (tokensToMigrate > tokenUsed) {
            _burnTokens(tokensToMigrate - tokenUsed);
        }

        liveDexCurve = true;
        liveDexCurveV3 = true;
        migratedDexV3 = true;
        migratedPair = pool;
        v3TokenId = tokenId;

        emit DexCurveOpened(pool, tokenUsed, 0, uint256(liquidity), block.timestamp);

        uint256 quoteReserve = _getDexQuoteReserve();
        if (quoteReserve >= graduationTargetEth) {
            _completeDexCurve(quoteReserve);
        }
    }

    function _completeDexCurve(uint256 quoteReserve) internal {
        require(liveDexCurve, "dex curve not live");
        require(migratedPair != address(0), "pair not set");

        liveDexCurve = false;
        graduated = true;
        graduatedAt = block.timestamp;

        uint256 lpBurned;
        bool wasV3 = liveDexCurveV3;
        if (wasV3) {
            lpBurned = v3TokenId;
            if (lpBurned > 0) {
                IUniswapV3PositionManagerLike(v3PositionManager).transferFrom(address(this), BURN_ADDRESS, lpBurned);
                v3TokenId = 0;
            }
            liveDexCurveV3 = false;
        } else {
            lpBurned = IERC20(migratedPair).balanceOf(address(this));
        }
        if (lpBurned > 0 && !wasV3) {
            bool sentLp = IERC20(migratedPair).transfer(BURN_ADDRESS, lpBurned);
            require(sentLp, "lp burn failed");
        }

        uint256 tokenSupplyBurned = _burnTokenBalance();

        emit DexCurveCompleted(migratedPair, quoteReserve, lpBurned, tokenSupplyBurned, block.timestamp);
    }

    function _addLiquidityToDex(
        address lpReceiver,
        bool burnTokenDust
    ) internal returns (uint256 tokenUsed, uint256 ethUsed, uint256 lpMinted, address pair, uint256 tokenBurned) {
        require(lpReceiver != address(0), "lp receiver required");
        uint256 tokensToMigrate = tokenReserve;
        uint256 ethToMigrate = ethReserve;

        tokenReserve = 0;
        ethReserve = 0;

        IERC20(token).approve(dexRouter, 0);
        IERC20(token).approve(dexRouter, tokensToMigrate);

        (tokenUsed, ethUsed, lpMinted) = IUniswapV2RouterLike(dexRouter).addLiquidityETH{value: ethToMigrate}(
            token,
            tokensToMigrate,
            0,
            0,
            lpReceiver,
            block.timestamp + 1 hours
        );

        pair = IUniswapV2FactoryLike(IUniswapV2RouterLike(dexRouter).factory()).getPair(
            token,
            IUniswapV2RouterLike(dexRouter).WETH()
        );

        if (tokensToMigrate > tokenUsed) {
            uint256 tokenDust = tokensToMigrate - tokenUsed;
            if (burnTokenDust) {
                tokenBurned += _burnTokens(tokenDust);
            } else {
                bool sentTokenDust = IERC20(token).transfer(feeRecipient, tokenDust);
                require(sentTokenDust, "token dust transfer failed");
            }
        }

        if (ethToMigrate > ethUsed) {
            uint256 ethDust = ethToMigrate - ethUsed;
            (bool sentEthDust, ) = feeRecipient.call{value: ethDust}("");
            require(sentEthDust, "eth dust transfer failed");
        }
    }

    function _burnTokenBalance() internal returns (uint256 burned) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) {
            return 0;
        }
        return _burnTokens(balance);
    }

    function _burnTokens(uint256 amount) internal returns (uint256 burned) {
        if (amount == 0) {
            return 0;
        }
        bool ok = IERC20(token).burn(amount);
        require(ok, "token burn failed");
        return amount;
    }

    function _getDexSpotPrice() internal view returns (uint256) {
        if (migratedDexV3 && migratedPair != address(0)) {
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3PoolLike(migratedPair).slot0();
            if (sqrtPriceX96 == 0) {
                return 0;
            }

            uint256 sqrtPrice = uint256(sqrtPriceX96);
            uint256 priceX192 = sqrtPrice * sqrtPrice;
            address v3Weth = IUniswapV3PositionManagerLike(v3PositionManager).WETH9();
            if (token < v3Weth) {
                return (priceX192 * 1e18) / Q192;
            }
            return (Q192 * 1e18) / priceX192;
        }

        (uint256 tokenDexReserve, uint256 quoteDexReserve) = _getDexReserves();
        if (tokenDexReserve == 0 || quoteDexReserve == 0) {
            return 0;
        }
        return (quoteDexReserve * 1e18) / tokenDexReserve;
    }

    function _getDexQuoteReserve() internal view returns (uint256) {
        (, uint256 quoteDexReserve) = _getDexReserves();
        return quoteDexReserve;
    }

    function _getDexReserves() internal view returns (uint256 tokenDexReserve, uint256 quoteDexReserve) {
        if (migratedPair == address(0)) {
            return (0, 0);
        }

        if (migratedDexV3) {
            address v3Weth = IUniswapV3PositionManagerLike(v3PositionManager).WETH9();
            tokenDexReserve = IERC20(token).balanceOf(migratedPair);
            quoteDexReserve = IERC20(v3Weth).balanceOf(migratedPair);
            return (tokenDexReserve, quoteDexReserve);
        }

        if (dexRouter == address(0)) {
            return (0, 0);
        }

        address weth = IUniswapV2RouterLike(dexRouter).WETH();
        IUniswapV2PairLike pair = IUniswapV2PairLike(migratedPair);
        address token0 = pair.token0();
        address token1 = pair.token1();
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();

        if (token0 == token && token1 == weth) {
            tokenDexReserve = uint256(reserve0);
            quoteDexReserve = uint256(reserve1);
        } else if (token1 == token && token0 == weth) {
            tokenDexReserve = uint256(reserve1);
            quoteDexReserve = uint256(reserve0);
        }
    }

    function _getBuyQuoteFromNetEth(uint256 netEthIn) internal view returns (uint256) {
        if (netEthIn == 0) {
            return 0;
        }

        uint256 x = ethReserve + virtualEthReserve;
        uint256 y = tokenReserve + virtualTokenReserve;
        uint256 k = x * y;

        uint256 newX = x + netEthIn;
        uint256 newY = k / newX;

        if (y <= newY) {
            return 0;
        }

        uint256 tokensOut = y - newY;
        if (tokensOut > tokenReserve) {
            return tokenReserve;
        }

        return tokensOut;
    }

    function _getSellQuoteGross(uint256 tokenAmountIn) internal view returns (uint256) {
        uint256 x = ethReserve + virtualEthReserve;
        uint256 y = tokenReserve + virtualTokenReserve;
        uint256 k = x * y;

        uint256 newY = y + tokenAmountIn;
        uint256 newX = k / newY;

        if (x <= newX) {
            return 0;
        }

        uint256 grossEthOut = x - newX;
        if (grossEthOut > ethReserve) {
            return ethReserve;
        }

        return grossEthOut;
    }
}
