import { ethers } from 'hardhat';

async function main() {
    const DataProviderManager = await ethers.getContractFactory("DataProviderManager");
    const deployedContract = await DataProviderManager.deploy(50);
    console.log("Contract Deployed to Address:", deployedContract.address);
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });