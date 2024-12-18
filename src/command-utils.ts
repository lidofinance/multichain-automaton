import chalk from "chalk";
import { spawnSync } from "child_process";

export function runCommand({
  command,
  args = [],
  workingDirectory = process.cwd(),
  environment = process.env,
  throwOnFail = true,
  tryNumber = 1,
  maxTries = 3,
}: {
  command: string;
  args: string[];
  workingDirectory: string;
  environment: NodeJS.ProcessEnv;
  throwOnFail: boolean;
  tryNumber: number;
  maxTries: number;
}) {
  console.debug(
    chalk.bold(
      chalk.yellowBright(
        `Run command in ${workingDirectory}: ${command} ${args.join(" ")} (try ${tryNumber} of ${maxTries})\n`
      )
    )
  );

  const result = spawnSync(command, args, {
    cwd: workingDirectory,
    stdio: "inherit",
    env: environment,
  });

  if (throwOnFail && result.status !== 0) {
    if (tryNumber < maxTries) {
      runCommand({
        command,
        args,
        workingDirectory,
        environment,
        throwOnFail,
        tryNumber: tryNumber + 1,
        maxTries,
      });
    } else {
      throw new Error(
        `Command failed after ${maxTries} attempts with exit code ${result.status}`
      );
    }
  }
}
