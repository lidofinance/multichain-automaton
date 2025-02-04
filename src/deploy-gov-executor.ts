import { readFileSync, writeFileSync } from "node:fs";

import { ethers } from "ethers";

import { loadDeploymentArtifacts, saveDeployArtifacts } from "./deployment-artifacts";
import env from "./env";
import { LogCallback, LogType } from "./log-utils";
import { DeployParameters, GovBridgeExecutor } from "./main-config";

const GOV_BRIDGE_EXECUTOR_PATH =
  "./governance-crosschain-bridges/artifacts/contracts/bridges/OptimismBridgeExecutor.sol/OptimismBridgeExecutor.json";
const MAX_DEPLOYMENT_TRIES = 3;

type ConstructorArgs = [
  string, // ovmL2Messenger
  string, // ethereumGovExecutor
  number, // delay
  number, // gracePeriod
  number, // minDelay
  number, // maxDelay
  string, // ovmGuiardian
];

async function deployGovExecutor(deploymentConfig: DeployParameters, rpcUrl: string, logCallback: LogCallback) {
  const contractJson = JSON.parse(readFileSync(GOV_BRIDGE_EXECUTOR_PATH, "utf-8"));
  const { abi, bytecode } = contractJson;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(env.string("DEPLOYER_PRIVATE_KEY"), provider);

  const contractFactory = new ethers.ContractFactory<ConstructorArgs, ethers.BaseContract>(abi, bytecode, wallet);

  const govBridgeExecutorConfig = deploymentConfig.l2.govBridgeExecutor;
  const contract = await deploy(contractFactory, govBridgeExecutorConfig, 1, logCallback);
  const deployedContractAddress = await contract.getAddress();

  const pad = " ".repeat(4);
  logCallback(`Deployer: ${wallet.address}`, LogType.Level1);
  logCallback(`${pad}· GovBridgeExecutor: ${deployedContractAddress}`, LogType.Level1);

  return deployedContractAddress;
}

async function deploy(
  contractFactory: ethers.ContractFactory<ConstructorArgs, ethers.BaseContract>,
  govBridgeExecutorConfig: GovBridgeExecutor,
  tryIndex: number,
  logCallback: LogCallback,
) {
  logCallback(`Deploying GovBridgeExecutor try: ${tryIndex}`, LogType.Level1);

  try {
    const contract = await contractFactory.deploy(
      govBridgeExecutorConfig.ovmL2Messenger,
      govBridgeExecutorConfig.ethereumGovExecutor,
      govBridgeExecutorConfig.delay,
      govBridgeExecutorConfig.gracePeriod,
      govBridgeExecutorConfig.minDelay,
      govBridgeExecutorConfig.maxDelay,
      govBridgeExecutorConfig.ovmGuiardian,
    );
    await contract.deploymentTransaction();
    return contract;
  } catch (error) {
    if (tryIndex < MAX_DEPLOYMENT_TRIES) {
      return await deploy(contractFactory, govBridgeExecutorConfig, tryIndex + 1, logCallback);
    } else {
      throw error;
    }
  }
}

function saveGovExecutorDeploymentArgs({
  contractAddress,
  deploymentConfig,
  fileName,
}: {
  contractAddress: string;
  deploymentConfig: DeployParameters;
  fileName: string;
}) {
  const govBridgeExecutorConfig = deploymentConfig.l2.govBridgeExecutor;
  const content = {
    [contractAddress]: [
      govBridgeExecutorConfig.ovmL2Messenger,
      govBridgeExecutorConfig.ethereumGovExecutor,
      govBridgeExecutorConfig.delay,
      govBridgeExecutorConfig.gracePeriod,
      govBridgeExecutorConfig.minDelay,
      govBridgeExecutorConfig.maxDelay,
      govBridgeExecutorConfig.ovmGuiardian,
    ],
  };
  writeFileSync(`./artifacts/${fileName}`, JSON.stringify(content, null, 2));
}

function saveGovExecutorToDeploymentArtifacts({
  govBridgeExecutor,
  deploymentResultsFilename,
}: {
  govBridgeExecutor: string;
  deploymentResultsFilename: string;
}) {
  const deployArtifacts = loadDeploymentArtifacts({fileName: deploymentResultsFilename});
  deployArtifacts.l2.govBridgeExecutor = govBridgeExecutor;
  saveDeployArtifacts(deployArtifacts, deploymentResultsFilename);
}

export {
    deployGovExecutor,
    saveGovExecutorDeploymentArgs,
    saveGovExecutorToDeploymentArtifacts
}