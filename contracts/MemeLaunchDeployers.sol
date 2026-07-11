// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./MemeToken.sol";
import "./MemePool.sol";

contract MemeTokenDeployer {
    function deployToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        address factory,
        address creator,
        address platformFeeRecipient,
        uint256 tradeFeeBps
    ) external returns (address) {
        return address(new MemeToken(name, symbol, totalSupply, factory, creator, platformFeeRecipient, tradeFeeBps));
    }
}

contract MemePoolDeployer {
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
    ) external returns (address) {
        return address(
            new MemePool(
                token,
                factory,
                feeRecipient,
                feeBps,
                virtualEthReserve,
                virtualTokenReserve,
                graduationTargetEth,
                dexRouter,
                lpRecipient,
                v3PositionManager,
                v3Fee
            )
        );
    }
}
