import { ethers } from 'ethers'
import { readFileSync } from 'node:fs';
const process = require('node:process');

export async function deployGovExecutor(deploymentConfig: any, rpcUrl: string) {
  const contractJson = JSON.parse(readFileSync("./governance-crosschain-bridges/artifacts/contracts/bridges/OptimismBridgeExecutor.sol/OptimismBridgeExecutor.json", "utf-8"));
  const { abi, bytecode } = contractJson;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.ETH_DEPLOYER_PRIVATE_KEY, provider);
  const ContractFactory = new ethers.ContractFactory(abi, bytecode, wallet);

  const govBridgeExecutorConfig = deploymentConfig["optimism"]["govBridgeExecutor"];
  const contract = await ContractFactory.deploy(
    govBridgeExecutorConfig["ovmL2Messenger"],
    govBridgeExecutorConfig["ethereumGovExecutor"],
    govBridgeExecutorConfig["delay"],
    govBridgeExecutorConfig["gracePeriod"],
    govBridgeExecutorConfig["minDelay"],
    govBridgeExecutorConfig["maxDelay"],
    govBridgeExecutorConfig["ovmGuiardian"]
  );

  await contract.deploymentTransaction();
  console.log("Contract deployed at address:", await contract.getAddress());
  
  return contract.getAddress();
}


