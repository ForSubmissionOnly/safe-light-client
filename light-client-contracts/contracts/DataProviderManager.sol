// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract DataProviderManager {
    struct DataProvider {
        uint256 stake;
        bool isActive;
        bool isLeaving;
        uint256 withdrawRequestBlock;
        uint256 lockedStake;  // Amount of stake locked in insurances
    }

    struct Insurance {
        address lightClient;
        address[] dataProviders;
        uint256[] stakes;
        uint256 expiry;
    }

    uint256 public constant MIN_STAKE = 1 ether; // Minimum stake required to be a data provider
    uint256 public updateEpochLength; // Length of an update epoch in blocks
    uint256 public maxFinalizationDelay = 75; // Maximum delay to finalize a block
    uint256 public nextInsuranceId = 1;
    uint256 public costNom = 3;
    uint256 public costDenom = 100000000;

    mapping(address => DataProvider) public dataProviders;
    mapping(bytes32 => bool) public finalizedBlockHashes;
    mapping(uint256 => Insurance) public insurances;

    event RegisterRequested(address indexed provider, uint256 stake);
    event WithdrawalRequested(address indexed provider);
    event Withdrawn(address indexed provider, uint256 amount);
    event Slashed(address indexed provider, uint256 amount);
    event InsuranceBought(uint256 indexed insuranceId, address lightClient, uint256 expiry);
    event ClaimMade(uint256 indexed insuranceId, uint256 amountClaimed);
    event StakesUnlocked(uint256 indexed insuranceId);


    constructor(uint256 _updateEpochLength) {
        updateEpochLength = _updateEpochLength;
    }

    function register() external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(dataProviders[msg.sender].stake == 0, "Provider already registered");

        dataProviders[msg.sender] = DataProvider({
            stake: msg.value,
            isActive: true, // it is okay to activate right away instead of waiting for the next epoch
            isLeaving: false,
            withdrawRequestBlock: 0,
            lockedStake: 0
        });

        emit RegisterRequested(msg.sender, msg.value);
    }

    function requestWithdrawal() external {
        require(dataProviders[msg.sender].isActive, "Provider not active");
        dataProviders[msg.sender].isLeaving = true;
        dataProviders[msg.sender].withdrawRequestBlock = block.number;
        emit WithdrawalRequested(msg.sender);
    }

    function buyInsurance(address[] calldata providers, uint256[] memory amounts, uint256 duration) external payable returns (uint256) {
        uint256 expiry = block.timestamp + duration;

        for (uint i = 0; i < providers.length; i++) {
            require(dataProviders[providers[i]].isActive && !dataProviders[providers[i]].isLeaving, "Provider not available");
            require(dataProviders[providers[i]].stake - dataProviders[providers[i]].lockedStake >= amounts[i], "Insufficient available stake");
            dataProviders[providers[i]].lockedStake += amounts[i];
        }

        uint256 insuranceId = nextInsuranceId++;
        insurances[insuranceId] = Insurance({
            lightClient: msg.sender,
            dataProviders: providers,
            stakes: amounts,
            expiry: expiry
        });

        require(cost(amounts, duration) <= msg.value, "Low fee payment");

        emit InsuranceBought(insuranceId, msg.sender, expiry);
        return insuranceId;
    }

    // Watchers need to call this function to unlock the stake after each insurance expires
    function unlockStake(uint256 insuranceId) external {
        require(insurances[insuranceId].expiry <= block.timestamp, "Insurance not expired yet");

        for (uint i = 0; i < insurances[insuranceId].dataProviders.length; i++) {
            address provider = insurances[insuranceId].dataProviders[i];
            dataProviders[provider].lockedStake -= insurances[insuranceId].stakes[i];
        }
        // Remove the insurance
        delete insurances[insuranceId];
        emit StakesUnlocked(insuranceId);
    }

    function executeWithdrawal(address provider) external {
        require(dataProviders[provider].isLeaving, "Withdrawal not requested");
        require(block.number/updateEpochLength >= dataProviders[provider].withdrawRequestBlock/updateEpochLength + 2, "Withdrawal not available yet");
        require(dataProviders[provider].lockedStake == 0, "Stake is currently locked under active insurance");

        uint256 stake = dataProviders[provider].stake;
        dataProviders[provider].stake = 0;
        dataProviders[provider].isActive = false;
        dataProviders[provider].isLeaving = false;
        dataProviders[provider].withdrawRequestBlock = 0;
        dataProviders[provider].lockedStake = 0;

        payable(provider).transfer(stake);
        emit Withdrawn(provider, stake);
    }

    function slash(
        address provider,
        bytes32 conflictingblockHash, 
        uint256 providerBlockNumber, 
        bytes32 providerBlockHash,
        string memory providerProof,
        bytes memory providerSignature
    ) external {
        require(dataProviders[provider].isActive, "Provider not active or already leaving");
        require(verifySignature(provider, providerBlockNumber, providerBlockHash, providerProof, providerSignature), "Invalid signature");
        require(conflictingblockHash != providerBlockHash, "Invalid proof: same tx root");
        validateConflictingHashInclusion(providerBlockNumber, conflictingblockHash);
        // Slash the provider
        if (finalizedBlockHashes[conflictingblockHash] || providerBlockNumber < block.number - maxFinalizationDelay) {
            uint256 slashedStake = dataProviders[provider].stake - dataProviders[provider].lockedStake;
            dataProviders[provider].stake = dataProviders[provider].lockedStake;
            if(dataProviders[provider].lockedStake == 0) {
                dataProviders[provider].stake = 0;
                dataProviders[provider].isActive = false;
                dataProviders[provider].isLeaving = false;
                dataProviders[provider].withdrawRequestBlock = 0;
            }
            emit Slashed(provider, slashedStake);
        }
    }

    function slashWithInsurance(
        address provider,
        bytes32 conflictingblockHash, 
        uint256 insuranceId,
        uint256 providerBlockNumber, 
        bytes32 providerBlockHash,
        string memory providerProof,
        bytes memory providerSignature
    ) external {
        require(dataProviders[provider].isActive, "Provider not active or already leaving");
        require(verifySignatureWithInsurance(provider, insuranceId, providerBlockNumber, providerBlockHash, providerProof, providerSignature), "Invalid signature");
        require(conflictingblockHash != providerBlockHash, "Invalid proof: same tx root");
        validateConflictingHashInclusion(providerBlockNumber, conflictingblockHash);
        // Slash the provider
        if (finalizedBlockHashes[conflictingblockHash] || providerBlockNumber < block.number - maxFinalizationDelay) {
            uint i;
            for (i = 0; i < insurances[insuranceId].dataProviders.length; i++) {
                if (insurances[insuranceId].dataProviders[i] == provider) {
                    break;
                }
            }
            uint256 slashedStake = insurances[insuranceId].stakes[i];
            dataProviders[provider].lockedStake -= slashedStake;
            dataProviders[provider].stake -= slashedStake;
            insurances[insuranceId].stakes[i] = 0;
            if(dataProviders[provider].stake == 0) {
                dataProviders[provider].lockedStake = 0;
                dataProviders[provider].isActive = false;
                dataProviders[provider].isLeaving = false;
                dataProviders[provider].withdrawRequestBlock = 0;
            }

            emit Slashed(provider, slashedStake);

            // Allocate the slashed stake to the insurance if valid
            if (insuranceId != 0 && insurances[insuranceId].expiry > block.timestamp) {
                // Transfer the amount to the light client
                payable(insurances[insuranceId].lightClient).transfer(slashedStake);

                emit ClaimMade(insuranceId, slashedStake);
            }
        }
    }

    function verifySignature(
        address provider, 
        uint256 providerBlockNumber, 
        bytes32 providerBlockHash,
        string memory providerProof,
        bytes memory providerSignature
    ) public pure returns (bool) {
        require(providerSignature.length == 65, "invalid signature length");
    
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(providerSignature, 32))
            s := mload(add(providerSignature, 64))
            v := byte(0, mload(add(providerSignature, 96)))
        }

        string memory message = string(abi.encodePacked(uintToString(providerBlockNumber), '?', '0x', bytes32ToString(providerBlockHash), '?', providerProof));

        return (ecrecover(prefixed(keccak256(abi.encodePacked(message))), v, r, s) == provider)? true : false;
    }

    function verifySignatureWithInsurance(
        address provider, 
        uint256 insuranceId,
        uint256 providerBlockNumber, 
        bytes32 providerBlockHash,
        string memory providerProof,
        bytes memory providerSignature
    ) public pure returns (bool) {
        require(providerSignature.length == 65, "invalid signature length");
    
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(providerSignature, 32))
            s := mload(add(providerSignature, 64))
            v := byte(0, mload(add(providerSignature, 96)))
        }

        string memory message = string(abi.encodePacked(uintToString(insuranceId), '?', uintToString(providerBlockNumber), '?', '0x', bytes32ToString(providerBlockHash), '?', providerProof));

        return (ecrecover(prefixed(keccak256(abi.encodePacked(message))), v, r, s) == provider)? true : false;
        return true;
    }

    function validateConflictingHashInclusion(uint256 blockNumber, bytes32 conflictingblockHash) private {
        if(conflictingblockHash == blockhash(blockNumber)) { // Note that the blockhash only returns data for the past 256 blocks
            finalizedBlockHashes[conflictingblockHash] = true;
        }
    }

    function cost(uint256[] memory amounts, uint256 duration) private view returns (uint256) {
        uint256 totalAmount = 0;
        for (uint i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        uint256 totalCost = totalAmount * duration * costNom / costDenom;
        return totalCost;
    }

    function prefixed(bytes32 hash) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function bytes32ToString(bytes32 data) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(64); // Length of hexadecimal representation of bytes32 is 64
        for (uint i = 0; i < 32; i++) {
            str[i*2] = alphabet[uint(uint8(data[i] >> 4))];
            str[i*2 + 1] = alphabet[uint(uint8(data[i] & 0x0f))];
        }
    return string(str);
}

    function uintToString(uint v) private pure returns (string memory str) {
        uint maxlength = 100;
        bytes memory reversed = new bytes(maxlength);
        uint i = 0;
        while (v != 0) {
            uint remainder = v % 10;
            v = v / 10;
            reversed[i++] = bytes1(uint8(48 + remainder));
        }
        bytes memory s = new bytes(i);
        for (uint j = 0; j < i; j++) {
            s[j] = reversed[i - j - 1];
        }
        str = string(s);
    }
}