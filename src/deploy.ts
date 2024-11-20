import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import { JsonRpcProvider } from "ethers";
import { ethers } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { runDiffyscan, setupDiffyscan } from "./diffyscan";
import { addGovExecutorToArtifacts, deployGovExecutor, saveArgs } from "./gov-executor";
import {
  configFromArtifacts,
  copyDeploymentArtifacts,
  populateDeployScriptEnvs,
  runDeployScript,
  runIntegrationTest,
  runVerification,
  runVerificationGovExecutor,
  setupL2RepoTests,
} from "./lido-l2-with-steth";
import { runStateMate, setupStateMateConfig, setupStateMateEnvs } from "./state-mate";
import { NetworkType } from "./types";

export type ChildProcess = child_process.ChildProcessWithoutNullStreams;
export type TestNode = { process: ChildProcess; rpcUrl: string };

const NUM_L1_DEPLOYED_CONTRACTS = 3;

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .option("--onlyCheck", "only check the real network deployment")
    .option("--onlyForkDeploy", "only deploy to the forked network")
    .parse();

  const configPath = program.args[0];
  return {
    configPath,
    onlyCheck: program.getOptionValue("onlyCheck"),
    onlyForkDeploy: program.getOptionValue("onlyForkDeploy"),
  };
}

function ethereumRpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? process.env.L1_LOCAL_RPC_URL! : process.env.L1_REMOTE_RPC_URL!;
}

function optimismRpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? process.env.L2_LOCAL_RPC_URL! : process.env.L2_REMOTE_RPC_URL!;
}

async function main() {
  console.log("start");

  const { configPath, onlyCheck, onlyForkDeploy } = parseCmdLineArgs();

  const config = loadYamlConfig(configPath);
  const deploymentConfig = config["deployParameters"];
  const testingParameters = config["testingParameters"];
  const statemateConfig = config["statemate"];

  const optProvider = new ethers.JsonRpcProvider(optimismRpc(NetworkType.Real));
  const { chainId } = await optProvider.getNetwork();

  // Deploy to the forked network
  if (!onlyCheck) {
    const ethNode = await spawnTestNode(ethereumRpc(NetworkType.Real), 8545, "l1ForkOutput.txt");
    const optNode = await spawnTestNode(optimismRpc(NetworkType.Real), 9545, "l2ForkOutput.txt");

    await burnL2DeployerNonces(optNode.rpcUrl, NUM_L1_DEPLOYED_CONTRACTS);
    const govBridgeExecutorForked = await deployGovExecutor(deploymentConfig, optimismRpc(NetworkType.Forked)!);
    saveArgs(govBridgeExecutorForked, deploymentConfig, "l2GovExecutorDeployArgsForked.json");

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorForked, NetworkType.Forked);
    runDeployScript(true);
    copyDeploymentArtifacts("deployResult.json", "deployResultForkedNetwork.json");
    copyDeploymentArtifacts("l1DeployArgs.json", "l1DeployArgsForked.json");
    copyDeploymentArtifacts("l2DeployArgs.json", "l2DeployArgsForked.json");

    let newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");
    addGovExecutorToArtifacts(govBridgeExecutorForked, newContractsCfgForked, "deployResultForkedNetwork.json");
    newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");

    setupStateMateEnvs(ethereumRpc(NetworkType.Forked), optimismRpc(NetworkType.Forked));
    setupStateMateConfig("automaton-sepolia-testnet.yaml", newContractsCfgForked, statemateConfig, chainId);
    runStateMate("automaton-sepolia-testnet.yaml");

    setupL2RepoTests(testingParameters, govBridgeExecutorForked, newContractsCfgForked);
    runIntegrationTest("bridging-non-rebasable.integration.test.ts");
    runIntegrationTest("bridging-rebasable.integration.test.ts");
    runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
    runIntegrationTest("optimism.integration.test.ts");

    ethNode.process.kill();
    optNode.process.kill();
  }

  if (onlyForkDeploy) {
    return;
  }

  // Deploy to the real network
  if (!onlyCheck) {
    await burnL2DeployerNonces(optimismRpc(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutor = await deployGovExecutor(deploymentConfig, optimismRpc(NetworkType.Real)!);
    saveArgs(govBridgeExecutor, deploymentConfig, "l2GovExecutorDeployArgs.json");

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
    runDeployScript();
    copyDeploymentArtifacts("deployResult.json", "deployResultRealNetwork.json");
    copyDeploymentArtifacts("l1DeployArgs.json", "l1DeployArgs.json");
    copyDeploymentArtifacts("l2DeployArgs.json", "l2DeployArgs.json");

    await runVerification("l1DeployArgs.json", "eth_sepolia");
    await runVerification("l2DeployArgs.json", "uni_sepolia");
    await runVerificationGovExecutor("l2GovExecutorDeployArgs.json", "uni_sepolia");
    const newContractsCfgReal = configFromArtifacts("deployResultRealNetwork.json");
    addGovExecutorToArtifacts(govBridgeExecutor, newContractsCfgReal, "deployResultRealNetwork.json");
  }
  const newContractsCfgReal = configFromArtifacts("deployResultRealNetwork.json");

  setupStateMateEnvs(ethereumRpc(NetworkType.Real), optimismRpc(NetworkType.Real));
  setupStateMateConfig("automaton-sepolia-testnet.yaml", newContractsCfgReal, statemateConfig, chainId);
  runStateMate("automaton-sepolia-testnet.yaml");

  // diffyscan + bytecode on real
  setupDiffyscan(
    newContractsCfgReal,
    newContractsCfgReal["optimism"]["govBridgeExecutor"],
    deploymentConfig,
    process.env.L1_REMOTE_RPC_URL!,
  );
  runDiffyscan("optimism_testnet_config_L1.json", false);

  setupDiffyscan(
    newContractsCfgReal,
    newContractsCfgReal["optimism"]["govBridgeExecutor"],
    deploymentConfig,
    process.env.L2_REMOTE_RPC_URL!,
  );
  runDiffyscan("optimism_testnet_config_L2_gov.json", false);
  runDiffyscan("optimism_testnet_config_L2.json", false);

  // run forks
  // run l2 test on them
  ethNode = await spawnTestNode(ethereumRpc(NetworkType.Real), 8545, "l1ForkAfterDeployOutput.txt");
  optNode = await spawnTestNode(optimismRpc(NetworkType.Real), 9545, "l2ForkAfterDeployOutput.txt");

  setupL2RepoTests(testingParameters, newContractsCfgReal["optimism"]["govBridgeExecutor"], newContractsCfgReal);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
  runIntegrationTest("optimism.integration.test.ts");

  ethNode.process.kill();
  optNode.process.kill();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function loadYamlConfig(stateFile: string) {
  const file = path.resolve(stateFile);
  const configContent = fs.readFileSync(file, "utf-8");
  const reviver = (_: unknown, v: unknown) => {
    return typeof v === "bigint" ? String(v) : v;
  };

  return YAML.parse(configContent, reviver, { schema: "core", intAsBigInt: true });
}

function isUrl(maybeUrl: string) {
  try {
    new URL(maybeUrl);
    return true;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_) {
    return false;
  }
}

function logError(arg: unknown) {
  console.error(`ERROR: ${arg}`);
  console.error();
  console.trace();
}

function logErrorAndExit(arg: unknown) {
  logError(arg);
  process.exit(1);
}

function readUrlOrFromEnv(urlOrEnvVarName: string) {
  if (isUrl(urlOrEnvVarName)) {
    return urlOrEnvVarName;
  } else {
    const valueFromEnv = process.env[urlOrEnvVarName] || "";
    if (!isUrl(valueFromEnv)) {
      logErrorAndExit(`Value "${valueFromEnv}" from env var "${urlOrEnvVarName}" is not a valid RPC url`);
    }
    return valueFromEnv;
  }
}

export async function spawnTestNode(rpcForkUrl: string, port: number, outputFileName: string) {
  const nodeCmd = "anvil";
  const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`];

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, "open");

  const processInstance = child_process.spawn(nodeCmd, nodeArgs, { stdio: ["ignore", output, output] });
  console.debug(`\nSpawning test node: ${nodeCmd} ${nodeArgs.join(" ")}`);

  const localhost = `http://localhost:${port}`;
  const provider = new JsonRpcProvider(localhost);
  let rpcError: Error | undefined = undefined;
  for (let attempt = 0; attempt < 30; ++attempt) {
    assert(processInstance);
    assert(processInstance.exitCode === null);
    try {
      await provider.getBlock("latest"); // check RPC is healthy
      rpcError = undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 1000));
      rpcError = e;
    }
  }
  if (rpcError !== undefined) {
    throw rpcError;
  }

  console.debug(`\nSpawned test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  return { processInstance, rpcForkUrl };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpcUrl(config: any, networkType: NetworkType) {
  if (networkType == NetworkType.Real) {
    return config["rpcEthRemote"], config["rpcOptRemote"];
  }
  return config["rpcEthLocal"], config["rpcOptLocal"];
}

async function burnL2DeployerNonces(l2RpcUrl: string, numNonces: number) {
  const l2Provider = new ethers.JsonRpcProvider(l2RpcUrl);
  const l2Deployer = new ethers.Wallet(process.env.L2_DEPLOYER_PRIVATE_KEY!, l2Provider);
  const l2DeployerAddress = await l2Deployer.getAddress();
  console.log(
    `Burning ${numNonces} nonces from L2 deployer ${l2DeployerAddress} to prevent L1 and L2 addresses collision...`,
  );
  for (let i = 0; i < numNonces; i++) {
    const tx = await l2Deployer.sendTransaction({ to: l2DeployerAddress, value: 0 });
    await tx.wait();
  }
}
