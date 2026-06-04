// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EtherpumpGoEscrow {
    struct BountyEscrow {
        address creator;
        uint256 amount;
        bool released;
        bool refunded;
    }

    mapping(bytes32 => BountyEscrow) public bounties;

    event BountyFunded(bytes32 indexed bountyId, address indexed creator, uint256 amount);
    event BountyReleased(bytes32 indexed bountyId, address indexed winner, uint256 amount);
    event BountyRefunded(bytes32 indexed bountyId, address indexed creator, uint256 amount);

    function fund(bytes32 bountyId) external payable {
        require(bountyId != bytes32(0), "invalid bounty");
        require(msg.value > 0, "no funds");
        require(bounties[bountyId].creator == address(0), "already funded");

        bounties[bountyId] = BountyEscrow({
            creator: msg.sender,
            amount: msg.value,
            released: false,
            refunded: false
        });

        emit BountyFunded(bountyId, msg.sender, msg.value);
    }

    function release(bytes32 bountyId, address payable winner) external {
        BountyEscrow storage bounty = bounties[bountyId];
        require(bounty.creator == msg.sender, "not creator");
        require(winner != address(0), "invalid winner");
        require(!bounty.released && !bounty.refunded, "closed");

        uint256 amount = bounty.amount;
        bounty.released = true;
        bounty.amount = 0;

        (bool ok, ) = winner.call{ value: amount }("");
        require(ok, "transfer failed");

        emit BountyReleased(bountyId, winner, amount);
    }

    function refund(bytes32 bountyId) external {
        BountyEscrow storage bounty = bounties[bountyId];
        require(bounty.creator == msg.sender, "not creator");
        require(!bounty.released && !bounty.refunded, "closed");

        uint256 amount = bounty.amount;
        bounty.refunded = true;
        bounty.amount = 0;

        (bool ok, ) = payable(msg.sender).call{ value: amount }("");
        require(ok, "transfer failed");

        emit BountyRefunded(bountyId, msg.sender, amount);
    }
}
