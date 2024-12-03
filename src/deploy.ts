import { strict as assert } from "node:assert";
import * as child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import "dotenv/config";
import { program } from "commander";
import { ethers, JsonRpcProvider } from "ethers";
import { once } from "stream";
import * as YAML from "yaml";

import { runDiffyscan, setupDiffyscan } from "./diffyscan";
import { addGovExecutorToArtifacts, deployGovExecutor, saveArgs } from "./gov-executor";
import {
  burnL2DeployerNonces,
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

async function main() {
  console.log("start");

  const { configPath, onlyCheck, onlyForkDeploy } = parseCmdLineArgs();
  console.log(`Running script with\n  - configPath: ${configPath}\n  - onlyCheck: ${onlyCheck}\n  - onlyForkDeploy: ${onlyForkDeploy}`);

  const config = loadYamlConfig(configPath);
  const deploymentConfig = config["deployParameters"];
  const testingParameters = config["testingParameters"];
  const statemateConfig = config["statemate"];

  const l2Provider = new ethers.JsonRpcProvider(l2Rpc(NetworkType.Real));
  const { chainId } = await l2Provider.getNetwork();

  // Deploy to the forked network
  if (!onlyCheck) {    
    const l1ForkNode = await spawnNode(l1Rpc(NetworkType.Real), 8545, "l1ForkOutput.txt");
    const l2ForkNode = await spawnNode(l2Rpc(NetworkType.Real), 9545, "l2ForkOutput.txt");

    await burnL2DeployerNonces(l2Rpc(NetworkType.Forked), NUM_L1_DEPLOYED_CONTRACTS);
    const govBridgeExecutorForked = await deployGovExecutor(deploymentConfig, l2Rpc(NetworkType.Forked));
    saveArgs(govBridgeExecutorForked, deploymentConfig, "l2GovExecutorDeployArgsForked.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorForked, NetworkType.Forked);
    runDeployScript({ throwOnFail: true });
    copyDeploymentArtifacts("deployResult.json", "deployResultForkedNetwork.json");
    copyDeploymentArtifacts("l1DeployArgs.json", "l1DeployArgsForked.json");
    copyDeploymentArtifacts("l2DeployArgs.json", "l2DeployArgsForked.json");

    let newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");
    addGovExecutorToArtifacts(govBridgeExecutorForked, newContractsCfgForked, "deployResultForkedNetwork.json");
    newContractsCfgForked = configFromArtifacts("deployResultForkedNetwork.json");

    setupStateMateEnvs(l1Rpc(NetworkType.Forked), l2Rpc(NetworkType.Forked));
    setupStateMateConfig("automaton-sepolia-testnet.yaml", newContractsCfgForked, statemateConfig, chainId);
    runStateMate("automaton-sepolia-testnet.yaml");

    setupL2RepoTests(testingParameters, govBridgeExecutorForked, newContractsCfgForked);
    runIntegrationTest("bridging-non-rebasable.integration.test.ts");
    runIntegrationTest("bridging-rebasable.integration.test.ts");
    runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
    runIntegrationTest("optimism.integration.test.ts");

    l1ForkNode.process.kill();
    l2ForkNode.process.kill();
  }

  if (onlyForkDeploy) {
    return;
  }

  // Deploy to the real network
  if (!onlyCheck) {
    await burnL2DeployerNonces(l2Rpc(NetworkType.Real), NUM_L1_DEPLOYED_CONTRACTS);

    const govBridgeExecutor = await deployGovExecutor(deploymentConfig, l2Rpc(NetworkType.Real));
    saveArgs(govBridgeExecutor, deploymentConfig, "l2GovExecutorDeployArgs.json")

    populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
    runDeployScript({ throwOnFail: true });
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

  setupStateMateEnvs(l1Rpc(NetworkType.Real), l2Rpc(NetworkType.Real));
  setupStateMateConfig("automaton-sepolia-testnet.yaml", newContractsCfgReal, statemateConfig, chainId);
  runStateMate("automaton-sepolia-testnet.yaml");

  // diffyscan + bytecode on real
  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, getRpcFromEnv("L1_REMOTE_RPC_URL"));
  runDiffyscan("optimism_testnet_config_L1.json", true);

  setupDiffyscan(newContractsCfgReal, newContractsCfgReal["optimism"]["govBridgeExecutor"], deploymentConfig, getRpcFromEnv("L2_REMOTE_RPC_URL"));
  runDiffyscan("optimism_testnet_config_L2_gov.json", true);
  runDiffyscan("optimism_testnet_config_L2.json", true);

  // run forks
  // run l2 test on them
  const l1ForkNode = await spawnNode(l1Rpc(NetworkType.Real), 8545, "l1ForkAfterDeployOutput.txt");
  const l2ForkNode = await spawnNode(l2Rpc(NetworkType.Real), 9545, "l2ForkAfterDeployOutput.txt");

  setupL2RepoTests(testingParameters, newContractsCfgReal["optimism"]["govBridgeExecutor"], newContractsCfgReal);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest("op-pusher-pushing-token-rate.integration.test.ts");
  runIntegrationTest("optimism.integration.test.ts");

  l1ForkNode.process.kill();
  l2ForkNode.process.kill();
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

async function spawnNode(rpcForkUrl: string, port: number, outputFileName: string) {
  const nodeCmd = "anvil";
  const nodeArgs = ["--fork-url", `${rpcForkUrl}`, "-p", `${port}`, "--no-storage-caching"];

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, "open");

  const processInstance = child_process.spawn(nodeCmd, nodeArgs, { stdio: ["ignore", output, output] });

  console.debug(`\nSpawning test node: ${nodeCmd} ${nodeArgs.join(" ")}`);
  console.debug(`Waiting 5 seconds ...`);
  await new Promise((r) => setTimeout(r, 5000));

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
  return { process: processInstance, rpcUrl: rpcForkUrl };
}

function l1Rpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? getRpcFromEnv("L1_LOCAL_RPC_URL") : getRpcFromEnv("L1_REMOTE_RPC_URL");
}

function l2Rpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? getRpcFromEnv("L2_LOCAL_RPC_URL") : getRpcFromEnv("L2_REMOTE_RPC_URL");
}

function getRpcFromEnv(rpcEnvName: string | undefined) {
  if (rpcEnvName === undefined) {
    console.error(`ERROR: Env "${rpcEnvName}" is undefined`);
    process.exit(1);
  }
  const valueFromEnv = process.env[rpcEnvName] || "";
  if (!isUrl(valueFromEnv)) {
    console.error(`ERROR: Value "${valueFromEnv}" from env var "${rpcEnvName}" is not a valid RPC url`);
    process.exit(1);
  }
  return valueFromEnv;
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
