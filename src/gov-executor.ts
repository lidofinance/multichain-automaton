import { readFileSync } from "node:fs";
import fs from "node:fs";
import process from "node:process";

import chalk from "chalk";
import { ethers } from "ethers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deployGovExecutor(deploymentConfig: any, rpcUrl: string) {
  const contractJson = JSON.parse(
    readFileSync(
      "./governance-crosschain-bridges/artifacts/contracts/bridges/OptimismBridgeExecutor.sol/OptimismBridgeExecutor.json",
      "utf-8",
    ),
  );
  const { abi, bytecode } = contractJson;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(process.env.L2_DEPLOYER_PRIVATE_KEY ?? "", provider);
  const ContractFactory = new ethers.ContractFactory(abi, bytecode, wallet);

  const govBridgeExecutorConfig = deploymentConfig["optimism"]["govBridgeExecutor"];
  const contract = await ContractFactory.deploy(
    govBridgeExecutorConfig["ovmL2Messenger"],
    govBridgeExecutorConfig["ethereumGovExecutor"],
    govBridgeExecutorConfig["delay"],
    govBridgeExecutorConfig["gracePeriod"],
    govBridgeExecutorConfig["minDelay"],
    govBridgeExecutorConfig["maxDelay"],
    govBridgeExecutorConfig["ovmGuiardian"],
  );

  await contract.deploymentTransaction();
  const deployedContractAddress = await contract.getAddress();

  console.log(chalk.bold(`Deploying GovBridgeExecutor\n`));

  const pad = " ".repeat(4);
  console.log(`Deployer: ${chalk.underline(wallet.address)}`);
  console.log(`${pad}· GovBridgeExecutor: ${chalk.green(deployedContractAddress)}`);

  return deployedContractAddress;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveArgs(contractAddress: string, deploymentConfig: any, fileName: string) {
  const govBridgeExecutorConfig = deploymentConfig["optimism"]["govBridgeExecutor"];

  const content = {
    [contractAddress]: [
      govBridgeExecutorConfig["ovmL2Messenger"],
      govBridgeExecutorConfig["ethereumGovExecutor"],
      govBridgeExecutorConfig["delay"],
      govBridgeExecutorConfig["gracePeriod"],
      govBridgeExecutorConfig["minDelay"],
      govBridgeExecutorConfig["maxDelay"],
      govBridgeExecutorConfig["ovmGuiardian"],
    ],
  };
  // save args
  fs.writeFileSync(`./artifacts/${fileName}`, JSON.stringify(content, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addGovExecutorToArtifacts(govBridgeExecutor: string, newContractsConfig: any, fileName: string) {
  newContractsConfig["optimism"]["govBridgeExecutor"] = govBridgeExecutor;
  fs.writeFileSync(`./artifacts/${fileName}`, JSON.stringify(newContractsConfig, null, 2));
}
