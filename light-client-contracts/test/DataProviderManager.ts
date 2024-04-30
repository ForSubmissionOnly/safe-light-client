import { expect } from "chai";
import { ethers } from "hardhat";
import { DataProviderManager } from "../typechain/DataProviderManager";
const { Web3 } = require('web3');
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

const web3 = new Web3();

describe("DataProviderManager Contract", function () {
	let dataProviderManager: DataProviderManager;
	let owner: any;
	let addr1: any;
	let addrs: any;
	let updateEpochLength: number = 50;

	beforeEach(async function () {
		[owner, addr1, ...addrs] = await ethers.getSigners();
		const DataProviderManager = await ethers.getContractFactory(
			"DataProviderManager"
		);
		dataProviderManager = await DataProviderManager.deploy(updateEpochLength); // assuming updateEpochLength is 50 blocks
		await dataProviderManager.deployed();
	});

	describe("register()", function () {
		it("should allow a new provider to register with sufficient stake", async function () {
		const tx = await dataProviderManager
			.connect(addr1)
			.register({ value: ethers.utils.parseEther("1") });
		await expect(tx).to.emit(dataProviderManager, "RegisterRequested");
		const provider = await dataProviderManager.dataProviders(addr1.address);
		expect(provider.stake).to.equal(ethers.utils.parseEther("1"));
		expect(provider.isActive).to.be.true;
		});

		it("should fail if the stake is less than the minimum required", async function () {
		await expect(
			dataProviderManager
			.connect(addr1)
			.register({ value: ethers.utils.parseEther("0.5") })
		).to.be.revertedWith("Insufficient stake");
		});

		it("should fail if the provider is already registered", async function () {
		await dataProviderManager
			.connect(addr1)
			.register({ value: ethers.utils.parseEther("1") });
		await expect(
			dataProviderManager
			.connect(addr1)
			.register({ value: ethers.utils.parseEther("1") })
		).to.be.revertedWith("Provider already registered");
		});
	});

	describe("requestWithdrawal()", function () {
		it("should allow active providers to request withdrawal", async function () {
		await dataProviderManager
			.connect(addr1)
			.register({ value: ethers.utils.parseEther("1") });
		const tx = await dataProviderManager.connect(addr1).requestWithdrawal();
		await expect(tx).to.emit(dataProviderManager, "WithdrawalRequested");
		const provider = await dataProviderManager.dataProviders(addr1.address);
		expect(provider.isLeaving).to.be.true;
		});

		it("should fail if the provider is not active", async function () {
		await expect(
			dataProviderManager.connect(addr1).requestWithdrawal()
		).to.be.revertedWith("Provider not active");
		});
	});

	describe("executeWithdrawal()", function () {
		it("should allow providers to withdraw after the cooldown period", async function () {
			await dataProviderManager
				.connect(addr1)
				.register({ value: ethers.utils.parseEther("1") });
			await dataProviderManager.connect(addr1).requestWithdrawal();
			// Simulate passing time (assuming deployment block number is 0 for simplicity)
			await mine(2 * updateEpochLength); // advance by 101 blocks

			const balanceBefore = await ethers.provider.getBalance(addr1.address);
			const tx = await dataProviderManager
				.connect(addr1)
				.executeWithdrawal(addr1.address);
			const balanceAfter = await ethers.provider.getBalance(addr1.address);

			// log everuthing
			expect(balanceAfter.sub(balanceBefore)).to.be.closeTo(
				ethers.utils.parseEther("1"),
				ethers.utils.parseEther("0.01")
			);
			await expect(tx).to.emit(dataProviderManager, "Withdrawn");
		});
	});

	describe("verifySignature()", function () {
		// Example test for checking the signature length
		it("should revert if the signature length is incorrect", async function () {
		const inputBlockNumber = 12345;
		const txRoot = "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421";
		const proof = "";
		const invalidSignature = "0x56e81f171b"; // clearly invalid, correct length is 65 bytes
		await expect(
			dataProviderManager.verifySignature(
			addr1.address,
			inputBlockNumber,
			txRoot,
			proof,
			invalidSignature
			)
		).to.be.revertedWith("invalid signature length");
		});

		// Example test for a correct signature
		it("should return true for a valid signature", async function () {
			// Setup message and sign it
			const inputBlockNumber = 12345;
			const txRoot = "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421";
			const proof = "";
			const hash = web3.utils.soliditySha3(web3.utils.encodePacked({value: inputBlockNumber.toString() + '?' + txRoot + '?' + proof, type: 'string'}));
			const signature: string = await web3.eth.accounts.sign(hash, "0xfc042707647d38b59722318c515ace8990d0ac892a04607d4de7f60144c5b7f4").signature;

			// Call the function that uses verifySignature
			expect(
				await dataProviderManager.verifySignature(
					"0xb39d71585EB033b0480F6e6b780Cae1fCF10447A",
					inputBlockNumber,
					txRoot,
					proof,
					signature
				)
			).to.be.true;
		});
	});

	describe("buyInsurance()", function () {
		beforeEach(async function () {
			// First, register two providers with sufficient stakes
			const stakeAmount = ethers.utils.parseEther("1");
			await dataProviderManager.connect(addr1).register({ value: stakeAmount });
			await dataProviderManager.connect(addrs[0]).register({ value: stakeAmount });		});

		it("should allow buying insurance if the stake is sufficient", async function () {
			const providers = [addr1.address, addrs[0].address];
			const amounts = [ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.5")];
			const duration = 86400; // 1 day in seconds
	
			// Buy insurance with combined stakes
			const insuranceCost = ethers.utils.parseEther("1"); // Assuming cost is the sum of amounts
			const tx = await dataProviderManager.connect(owner).buyInsurance(providers, amounts, duration, { value: insuranceCost });
	
			await expect(tx).to.emit(dataProviderManager, "InsuranceBought");
			const insuranceId = await tx.wait();
			expect(insuranceId).to.exist;
	
			// Check that the stakes are locked
			const provider1 = await dataProviderManager.dataProviders(addr1.address);
			expect(provider1.lockedStake).to.equal(amounts[0]);
			const provider2 = await dataProviderManager.dataProviders(addrs[0].address);
			expect(provider2.lockedStake).to.equal(amounts[1]);
		});
	
		it("should fail if the total insurance amount exceeds available stake", async function () {
			const providers = [addr1.address];
			const amounts = [ethers.utils.parseEther("1.2")]; // More than the staked amount
			const duration = 86400; // 1 day in seconds
	
			// Attempt to buy insurance
			const insuranceCost = ethers.utils.parseEther("1");
			await expect(
				dataProviderManager.connect(owner).buyInsurance(providers, amounts, duration, { value: insuranceCost })
			).to.be.revertedWith("Insufficient available stake");
		});

		it("should fail to buy insurance if the payment is insufficient", async function () {
			const insuranceAmount = ethers.utils.parseEther("1");
			const duration = 86400; // 1 day in seconds
			const insufficientPayment = ethers.utils.parseEther("0.0001"); // Less than needed
	
			await expect(dataProviderManager.connect(addrs[0]).buyInsurance(
				[addr1.address], 
				[insuranceAmount], 
				duration,
				{ value: insufficientPayment }
			)).to.be.revertedWith("Low fee payment");
		});
	});
	
	describe("unlockStake()", function () {
		let providerStake = ethers.utils.parseEther("5");
	
		beforeEach(async function () {
			// Register a provider with enough stake to cover multiple insurances
			await dataProviderManager.connect(addr1).register({ value: providerStake });
		});
	
		it("should allow unlocking stake after the insurance expires", async function () {
			const insuranceAmount = ethers.utils.parseEther("1");
			const duration = 1; // 1 second for quick test turnaround
	
			const tx = await dataProviderManager.connect(addrs[0]).buyInsurance(
				[addr1.address], 
				[insuranceAmount], 
				duration,
				{ value: insuranceAmount }
			);
			const txReceipt = await tx.wait();
			const insuranceId = txReceipt.events?.filter((x: any) => x.event === 'InsuranceBought')[0].args.insuranceId;
	
			// Fast forward time to after the insurance expiry
			await mine(duration + 1);
	
			await expect(dataProviderManager.connect(addrs[0]).unlockStake(insuranceId))
				.to.emit(dataProviderManager, "StakesUnlocked");
	
			const provider = await dataProviderManager.dataProviders(addr1.address);
			expect(provider.lockedStake).to.equal(ethers.utils.parseEther("0"));
		});
	
		it("should fail to unlock stake before the insurance expires", async function () {
			const insuranceAmount = ethers.utils.parseEther("1");
			const duration = 86400; // 1 day in seconds
	
			const tx = await dataProviderManager.connect(addrs[0]).buyInsurance(
				[addr1.address], 
				[insuranceAmount], 
				duration,
				{ value: insuranceAmount }
			);
			const txReceipt = await tx.wait();
			const insuranceId = txReceipt.events?.filter((x: any) => x.event === 'InsuranceBought')[0].args.insuranceId;
	
			// Try to unlock before the duration
			await expect(dataProviderManager.connect(addrs[0]).unlockStake(insuranceId))
				.to.be.revertedWith("Insurance not expired yet");
		});
	});
	
});
