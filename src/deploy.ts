import fs from "node:fs";
import path from "node:path";
import * as child_process from 'node:child_process'
import { strict as assert } from 'node:assert'
import process from "node:process";
import * as YAML from "yaml";
import { JsonRpcProvider } from 'ethers'
import { runDeployScript, populateDeployScriptEnvs, setupL2RepoTests, runIntegrationTest, copyDeploymentArtifacts, newContractsConfig } from './lido-l2-with-steth';
import { runDiffiscan, setupDiffyscan } from './diffyscan';
import { setupStateMateConfig, runStateMate, setupStateMateEnvs } from './state-mate';
import { NetworkType } from './types';
import { program } from "commander";

export type ChildProcess = child_process.ChildProcessWithoutNullStreams
export type TestNode = { process: ChildProcess, rpcUrl: string }

function parseCmdLineArgs() {
  program
    .argument("<config-path>", "path to .yaml config file")
    .parse();

  const configPath = program.args[0];
  return { configPath };
}

async function main() {
  console.log("start");

  const { configPath } = parseCmdLineArgs();

  const config = loadYamlConfig(configPath);
  const statemateConfig = config["statemate"];
  const deploymentConfig = config["deployParameters"];
  const testingParameters = config["testingParameters"];
  const diffyscanConfig = config["diffyscan"];

  var ethNode = await spawnTestNode(config["rpcEth"], 8545);
  var optNode = await spawnTestNode(config["rpcOpt"], 9545);

  populateDeployScriptEnvs(deploymentConfig, NetworkType.Forked);
  runDeployScript();
  copyDeploymentArtifacts('deployResult.json','deployResultForkedNetwork.json');
  const newContractsCfgForked = newContractsConfig('deployResultForkedNetwork.json');

  setupStateMateEnvs(statemateConfig, NetworkType.Forked);
  setupStateMateConfig('automaton-sepolia-testnet.yaml', newContractsCfgForked, NetworkType.Forked);
  runStateMate('automaton-sepolia-testnet.yaml');
  
  setupL2RepoTests(testingParameters, newContractsCfgForked);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
  runIntegrationTest('optimism.integration.test.ts');

  ethNode.process.kill();
  optNode.process.kill();

  // deploy to the real network
  populateDeployScriptEnvs(deploymentConfig, NetworkType.Real);
  runDeployScript();
  copyDeploymentArtifacts('deployResult.json','deployResultRealNetwork.json');
  const newContractsCfgReal = newContractsConfig('deployResultRealNetwork.json');

  // state-mate on real
  const newContractsCfgRemote = {
    "ethereum": {
      "bridgeImplAddress": "0x8375029773953d91CaCfa452b7D24556b9F318AA",
      "bridgeProxyAddress": "0x4Abf633d9c0F4aEebB4C2E3213c7aa1b8505D332",
      "opStackTokenRatePusherImplAddress": "0x4067B05a6B2f6801Bfb8d4fF417eD32e71c216d9"
    },
    "optimism": {
      "tokenImplAddress": "0x298953B9426eba4F35a137a4754278a16d97A063",
      "tokenProxyAddress": "0x24B47cd3A74f1799b32B2de11073764Cb1bb318B",
      "tokenRebasableImplAddress": "0xFd21C82c99ddFa56EB0B9B2D1d0709b7E26D1B2C",
      "tokenRebasableProxyAddress": "0xf49D208B5C7b10415C7BeAFe9e656F2DF9eDfe3B",
      "tokenBridgeImplAddress": "0xD48c69358193a34aC035ea7dfB70daDea1600112",
      "tokenBridgeProxyAddress": "0xdBA2760246f315203F8B716b3a7590F0FFdc704a",
      "tokenRateOracleImplAddress": "0xa989A4B3A26e28DC9d106F163B2B1f35153E0517",
      "tokenRateOracleProxyAddress": "0xB34F2747BCd9BCC4107A0ccEb43D5dcdd7Fabf89"
    }
  }
  setupStateMateEnvs(statemateConfig, NetworkType.Real);
  setupStateMateConfig('automaton-sepolia-testnet.yaml', newContractsCfgRemote, NetworkType.Real);
  runStateMate('automaton-sepolia-testnet.yaml');

  // diffyscan + bytecode on real
  setupDiffyscan(diffyscanConfig, newContractsCfgRemote);
  runDiffiscan('optimism_testnet_config_L1.json');
  runDiffiscan('optimism_testnet_config_L2_gov.json');
  runDiffiscan('optimism_testnet_config_L2.json');

  // run forks
  // run l2 test on them
  ethNode = await spawnTestNode(config["rpcEth"], 8545);
  optNode = await spawnTestNode(config["rpcOpt"], 9545);

  setupL2RepoTests(testingParameters, newContractsCfgRemote);
  runIntegrationTest("bridging-non-rebasable.integration.test.ts");
  runIntegrationTest("bridging-rebasable.integration.test.ts");
  runIntegrationTest('op-pusher-pushing-token-rate.integration.test.ts');
  runIntegrationTest('optimism.integration.test.ts');

  ethNode.process.kill();
  optNode.process.kill();
}

main().catch((error) => {
  logError(error);
  process.exitCode = 1;
});

function logError(arg: unknown) {
  console.error(`ERROR: ${arg}`);
  console.error();
  console.trace();
}

function loadYamlConfig(stateFile: string) {
  const file = path.resolve(stateFile);
  const configContent = fs.readFileSync(file, "utf-8");
  const reviver = (_: unknown, v: unknown) => {
    return typeof v === "bigint" ? String(v) : v;
  };

  return YAML.parse(configContent, reviver, { schema: "core", intAsBigInt: true });
}

export async function spawnTestNode(rpcUrl: string, port: number): Promise<TestNode> {
  const nodeCmd = 'hardhat'
  const nodeArgs = [
    'node',
    '--fork', `${rpcUrl}`,
    '--port', `${port}`,
  ]
  const process = child_process.spawn(nodeCmd, nodeArgs)

  process.stderr.on('data', (data: unknown) => {
    console.error(`${nodeCmd}'s stderr: ${data}`)
  })

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
      await new Promise((r) => setTimeout(r, 500))
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
