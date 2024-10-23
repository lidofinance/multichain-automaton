import fs from "node:fs";
import path from "node:path";
import * as YAML from "yaml";

const YML = "yml";

const util = require('node:util');
const exec = util.promisify(require('node:child_process').exec);

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

export async function main() {
  console.log("start");


    // 1. read master config
  const config = loadYamlConfig("./configs/main.yaml");
  console.log("config=",config);


  const rpcEth = config["rpcEth"];

  // 2. run on forks
  //      a. run forks (what params to use)
  runHardhatForks(rpcEth);



  //      b. run relayer (params)
  //      c. lidol2.deploy L1
//              notifier
//              pusher
//              l1bridge
//              l2calldata:
//                l2bridge
//                tokenOracle
//                wstETH
//                stETH
//        d. call gov execute

  //    check state-mate, tests
}

async function runHardhatForks(rpcEth: string) {
  const { stdout, stderr } = await exec(`./lido-l2-with-steth/ts-node hardhat node:fork ${rpcEth} 8545`);
  console.log('stdout:', stdout);
  console.error('stderr:', stderr);
}


main().catch((error) => {
  logError(error);
  process.exitCode = 1;
});
