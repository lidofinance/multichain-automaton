import { writeFileSync, readFileSync } from "node:fs";
import chalk from "chalk";
import { ethers } from "ethers";
import env from "./env";

const GOV_BRIDGE_EXECUTOR_PATH = "./governance-crosschain-bridges/artifacts/contracts/bridges/OptimismBridgeExecutor.sol/OptimismBridgeExecutor.json";
const MAX_DEPLOYMENT_TRIES = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deployGovExecutor(deploymentConfig: any, rpcUrl: string) {
  const contractJson = JSON.parse(
    readFileSync(
      GOV_BRIDGE_EXECUTOR_PATH,
      "utf-8",
    ),
  );
  const { abi, bytecode } = contractJson;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(env.string("DEPLOYER_PRIVATE_KEY"), provider);
  const contractFactory = new ethers.ContractFactory(abi, bytecode, wallet);

  const govBridgeExecutorConfig = deploymentConfig["l2"]["govBridgeExecutor"];
  const contract = await deploy(contractFactory, govBridgeExecutorConfig, 1);
  const deployedContractAddress = await contract.getAddress();

  const pad = " ".repeat(4);
  console.log(`Deployer: ${chalk.underline(wallet.address)}`);
  console.log(`${pad}· GovBridgeExecutor: ${chalk.green(deployedContractAddress)}`);

  return deployedContractAddress;
}

async function deploy(contractFactory: ethers.ContractFactory<any[], ethers.BaseContract>, govBridgeExecutorConfig: Record<string, any>, tryIndex: number) {
  console.log(
    chalk.bold(
      chalk.yellowBright(
        `Deploying GovBridgeExecutor try: ${tryIndex}\n`
      )
    )
  );

  try {
      const contract = await contractFactory.deploy(
        govBridgeExecutorConfig["ovmL2Messenger"],
        govBridgeExecutorConfig["ethereumGovExecutor"],
        govBridgeExecutorConfig["delay"],
        govBridgeExecutorConfig["gracePeriod"],
        govBridgeExecutorConfig["minDelay"],
        govBridgeExecutorConfig["maxDelay"],
        govBridgeExecutorConfig["ovmGuiardian"],
      );
      await contract.deploymentTransaction();
      return contract;
    } catch (error) {
      if (tryIndex < MAX_DEPLOYMENT_TRIES) {
        return await deploy(contractFactory, govBridgeExecutorConfig, tryIndex + 1);
      } else {
        throw error;
      }
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveGovExecutorDeploymentArgs(contractAddress: string, deploymentConfig: any, fileName: string) {
  const govBridgeExecutorConfig = deploymentConfig["l2"]["govBridgeExecutor"];

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
  writeFileSync(`./artifacts/${fileName}`, JSON.stringify(content, null, 2));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addGovExecutorToDeploymentArtifacts(govBridgeExecutor: string, deploymentResultsFilename: string) {
  let newContractsConfig = configFromArtifacts(deploymentResultsFilename);
  newContractsConfig["optimism"]["govBridgeExecutor"] = govBridgeExecutor;
  writeFileSync(`./artifacts/${deploymentResultsFilename}`, JSON.stringify(newContractsConfig, null, 2));
}

function configFromArtifacts(fileName: string) {
  const data = readFileSync(`./artifacts/${fileName}`, "utf8");
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`can't parse deploy file ${fileName}: ${(error as Error).message}`);
  }
}
