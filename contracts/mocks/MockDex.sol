// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract MockQuoteToken {
    string public constant name = "Mock WETH";
    string public constant symbol = "WETH";
    uint8 public constant decimals = 18;

    mapping(address account => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract MockV3Pool {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    uint160 public sqrtPriceX96;
    uint128 public liquidity;

    constructor(address _token0, address _token1, uint24 _fee, uint160 _sqrtPriceX96) {
        token0 = _token0;
        token1 = _token1;
        fee = _fee;
        sqrtPriceX96 = _sqrtPriceX96;
    }

    function addLiquidity(uint128 amount) external {
        liquidity += amount;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        )
    {
        return (sqrtPriceX96, 0, 0, 0, 0, 0, true);
    }
}

contract MockV3PositionManager {
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

    address public immutable WETH9;
    uint256 public nextTokenId = 1;

    mapping(bytes32 key => address pool) public pools;
    mapping(uint256 tokenId => address owner) public ownerOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    constructor(address _weth) {
        require(_weth != address(0), "weth required");
        WETH9 = _weth;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool) {
        bytes32 key = _poolKey(token0, token1, fee);
        pool = pools[key];
        if (pool == address(0)) {
            pool = address(new MockV3Pool(token0, token1, fee, sqrtPriceX96));
            pools[key] = pool;
        }
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(params.recipient != address(0), "recipient required");
        address pool = pools[_poolKey(params.token0, params.token1, params.fee)];
        require(pool != address(0), "pool required");

        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        if (amount0 > 0) {
            require(IERC20Like(params.token0).transferFrom(msg.sender, pool, amount0), "token0 transfer failed");
        }
        if (amount1 > 0) {
            require(IERC20Like(params.token1).transferFrom(msg.sender, pool, amount1), "token1 transfer failed");
        }

        uint256 liq = amount0 > 0 ? amount0 : amount1;
        liquidity = uint128(liq > type(uint128).max ? type(uint128).max : liq);
        MockV3Pool(pool).addLiquidity(liquidity);

        tokenId = nextTokenId++;
        ownerOf[tokenId] = params.recipient;
        emit Transfer(address(0), params.recipient, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        require(msg.sender == from, "not approved");
        ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _poolKey(address token0, address token1, uint24 fee) internal pure returns (bytes32) {
        return keccak256(abi.encode(token0, token1, fee));
    }
}

contract MockDexPair {
    string public constant name = "Mock LP";
    string public constant symbol = "MLP";
    uint8 public constant decimals = 18;

    address public immutable token0;
    address public immutable token1;
    address public immutable token;
    address public immutable weth;

    uint256 public tokenLiquidity;
    uint256 public ethLiquidity;
    uint256 public totalSupply;

    address public immutable router;
    mapping(address account => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(address _token0, address _token1, address _token, address _weth, address _router) {
        token0 = _token0;
        token1 = _token1;
        token = _token;
        weth = _weth;
        router = _router;
    }

    function notifyLiquidity(uint256 tokenAmount, address lpRecipient, uint256 liquidity) external {
        require(msg.sender == router, "only router");
        require(lpRecipient != address(0), "recipient required");
        tokenLiquidity += tokenAmount;
        if (liquidity > 0) {
            totalSupply += liquidity;
            balanceOf[lpRecipient] += liquidity;
            emit Transfer(address(0), lpRecipient, liquidity);
        }
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(to != address(0), "zero address");
        uint256 fromBalance = balanceOf[msg.sender];
        require(fromBalance >= amount, "balance too low");
        balanceOf[msg.sender] = fromBalance - amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        if (token0 == token && token1 == weth) {
            reserve0 = uint112(tokenLiquidity);
            reserve1 = uint112(ethLiquidity);
        } else {
            reserve0 = uint112(ethLiquidity);
            reserve1 = uint112(tokenLiquidity);
        }
        blockTimestampLast = uint32(block.timestamp);
    }

    receive() external payable {
        require(msg.sender == router, "only router");
        ethLiquidity += msg.value;
    }
}

contract MockDexFactory {
    mapping(address => mapping(address => address)) public getPair;

    event PairCreated(address indexed token0, address indexed token1, address pair);

    function createPair(address tokenA, address tokenB, address router) public returns (address pair) {
        require(tokenA != tokenB, "identical");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "zero");
        require(getPair[token0][token1] == address(0), "exists");

        pair = address(new MockDexPair(token0, token1, tokenA, tokenB, router));
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;

        emit PairCreated(token0, token1, pair);
    }
}

contract MockDexRouter {
    address public immutable WETH;
    address public immutable factory;

    constructor(address _weth) {
        require(_weth != address(0), "weth required");
        WETH = _weth;
        factory = address(new MockDexFactory());
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address to,
        uint256
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        address pair = MockDexFactory(factory).getPair(token, WETH);
        if (pair == address(0)) {
            pair = MockDexFactory(factory).createPair(token, WETH, address(this));
        }

        bool ok = IERC20Like(token).transferFrom(msg.sender, pair, amountTokenDesired);
        require(ok, "token transfer failed");

        uint256 minAmount = amountTokenDesired < msg.value ? amountTokenDesired : msg.value;
        liquidity = minAmount;

        MockDexPair(payable(pair)).notifyLiquidity(amountTokenDesired, to, liquidity);

        (bool sentEth, ) = pair.call{value: msg.value}("");
        require(sentEth, "eth transfer failed");

        amountToken = amountTokenDesired;
        amountETH = msg.value;
    }
}
