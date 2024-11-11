import 'dotenv/config'
import fs from "node:fs";
import path from "node:path";
import * as child_process from 'node:child_process'
import { strict as assert } from 'node:assert'
import process from "node:process";
import * as YAML from "yaml";
import { JsonRpcProvider } from 'ethers'
import {
  runDeployScript,
  populateDeployScriptEnvs,
  setupL2RepoTests,
  runIntegrationTest,
  copyDeploymentArtifacts,
  configFromArtifacts,
  runVerification,
  runVerificationGovExecutor
} from './lido-l2-with-steth';
import { runDiffyscan, setupDiffyscan } from './diffyscan';
import { setupStateMateConfig, runStateMate, setupStateMateEnvs } from './state-mate';
import { deployGovExecutor, addGovExecutorToArtifacts, saveArgs } from './gov-executor';
import { NetworkType } from './types';
import { program } from "commander";
import { ethers } from 'ethers'
const {once} = require('stream')

export type ChildProcess = child_process.ChildProcessWithoutNullStreams
export type TestNode = { process: ChildProcess, rpcUrl: string }

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .parse();

  const configPath = program.args[0];
  return { configPath };
}

function ethereumRpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? process.env.L1_LOCAL_RPC_URL! : process.env.L1_REMOTE_RPC_URL!;
}

function optimismRpc(networkType: NetworkType) {
  return networkType == NetworkType.Forked ? process.env.L2_LOCAL_RPC_URL! : process.env.L2_REMOTE_RPC_URL!;
}

async function main() {
  console.log("start");

  const { configPath } = parseCmdLineArgs();

  const config = loadYamlConfig(configPath);
  const deploymentConfig = config["deployParameters"];
  const testingParameters = config["testingParameters"];
  const statemateConfig = config["statemate"];

  var ethNode = await spawnTestNode(ethereumRpc(NetworkType.Real), 8545, "l1ForkOutput.txt");
  var optNode = await spawnTestNode(optimismRpc(NetworkType.Real), 9545, "l2ForkOutput.txt");

  const optProvider = new ethers.JsonRpcProvider(optimismRpc(NetworkType.Forked));
  const { chainId } = await optProvider.getNetwork();

  const govBridgeExecutorForked = await deployGovExecutor(deploymentConfig, optimismRpc(NetworkType.Forked)!);
  saveArgs(govBridgeExecutorForked, deploymentConfig, 'l2GovExecutorDeployArgsForked.json')

  populateDeployScriptEnvs(deploymentConfig, govBridgeExecutorForked, NetworkType.Forked);  
  runDeployScript();
  copyDeploymentArtifacts('deployResult.json','deployResultForkedNetwork.json');
  copyDeploymentArtifacts('l1DeployArgs.json','l1DeployArgsForked.json');
  copyDeploymentArtifacts('l2DeployArgs.json','l2DeployArgsForked.json');
  
  const newContractsCfgForked = configFromArtifacts('deployResultForkedNetwork.json');
  addGovExecutorToArtifacts(govBridgeExecutorForked, newContractsCfgForked, 'deployResultForkedNetwork.json');

  setupStateMateEnvs(
    ethereumRpc(NetworkType.Forked),
    optimismRpc(NetworkType.Forked)
  );
  setupStateMateConfig(
    'automaton-sepolia-testnet.yaml',
    newContractsCfgForked,
    statemateConfig,
    chainId,
    govBridgeExecutorForked
  );
  runStateMate('automaton-sepolia-testnet.yaml');

  setupL2RepoTests(testingParameters, govBridgeExecutorForked, newContractsCfgForked);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
  runIntegrationTest('optimism.integration.test.ts');
  
  ethNode.process.kill();
  optNode.process.kill();

  // // deploy to the real network
  const govBridgeExecutor = await deployGovExecutor(deploymentConfig, optimismRpc(NetworkType.Real)!);
  saveArgs(govBridgeExecutor, deploymentConfig, 'l2GovExecutorDeployArgs.json')

  populateDeployScriptEnvs(deploymentConfig, govBridgeExecutor, NetworkType.Real);
  runDeployScript();
  copyDeploymentArtifacts('deployResult.json','deployResultRealNetwork.json');
  copyDeploymentArtifacts('l1DeployArgs.json','l1DeployArgs.json');
  copyDeploymentArtifacts('l2DeployArgs.json','l2DeployArgs.json');

  await runVerification('l1DeployArgs.json', 'eth_sepolia');
  await runVerification('l2DeployArgs.json', 'uni_sepolia');
  await runVerificationGovExecutor('l2GovExecutorDeployArgs.json', 'uni_sepolia');
  const newContractsCfgReal = configFromArtifacts('deployResultRealNetwork.json');
  addGovExecutorToArtifacts(govBridgeExecutor, newContractsCfgReal, 'deployResultRealNetwork.json');

  setupStateMateEnvs(
    ethereumRpc(NetworkType.Real),
    optimismRpc(NetworkType.Real)
  );
  setupStateMateConfig(
    'automaton-sepolia-testnet.yaml',
    newContractsCfgReal,
    statemateConfig,
    chainId,
    govBridgeExecutor
  );
  runStateMate('automaton-sepolia-testnet.yaml');

  // diffyscan + bytecode on real
  setupDiffyscan(newContractsCfgReal, govBridgeExecutor, deploymentConfig, process.env.L1_REMOTE_RPC_URL!);
  runDiffyscan('optimism_testnet_config_L1.json', false);

  setupDiffyscan(newContractsCfgReal, govBridgeExecutor, deploymentConfig, process.env.L2_REMOTE_RPC_URL!);
  runDiffyscan('optimism_testnet_config_L2_gov.json', false);
  runDiffyscan('optimism_testnet_config_L2.json', false);

  // run forks
  // run l2 test on them
  ethNode = await spawnTestNode(ethereumRpc(NetworkType.Real), 8545, "l1ForkAfterDeployOutput.txt");
  optNode = await spawnTestNode(optimismRpc(NetworkType.Real), 9545, "l2ForkAfterDeployOutput.txt");

  setupL2RepoTests(testingParameters, govBridgeExecutor, newContractsCfgReal);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
  runIntegrationTest('optimism.integration.test.ts');

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

export async function spawnTestNode(rpcUrl: string, port: number, outputFileName: string) {
  const nodeCmd = 'anvil'
  const nodeArgs = [
    '--fork-url', `${rpcUrl}`,
    '-p', `${port}`,
  ]

  const output = fs.createWriteStream(`./artifacts/${outputFileName}`);
  await once(output, 'open');

  const process = child_process.spawn(nodeCmd, nodeArgs, { stdio: ['ignore', output, output] });
  console.debug(`\nSpawning test node: ${nodeCmd} ${nodeArgs.join(' ')}`)

  const localhost = `http://localhost:${port}`
  const provider = new JsonRpcProvider(localhost)
  let rpcError: Error | undefined = undefined
  for (let attempt = 0; attempt < 30; ++attempt) {
    assert(process)
    assert(process.exitCode === null)
    try {
      await provider.getBlock('latest') // check RPC is healthy
      rpcError = undefined
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 1000))
      rpcError = e
    }
  }
  if (rpcError !== undefined) {
    throw rpcError
  }

  console.debug(`\nSpawned test node: ${nodeCmd} ${nodeArgs.join(' ')}`)
  return { process, rpcUrl }
}

function rpcUrl(config: any, networkType: NetworkType) {
  if (networkType == NetworkType.Real) {
    return (config["rpcEthRemote"], config["rpcOptRemote"])
  }
  return  (config["rpcEthLocal"], config["rpcOptLocal"])
}
