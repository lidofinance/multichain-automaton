import { Writable } from "stream";

enum LogType {
  Level1,
  Level2,
}
type LogCallback = (message: string, type: LogType) => void;

function logToStream(stream: Writable, message: string, logType: LogType) {
  switch (logType) {
    case LogType.Level1:
      stream.write(`[${new Date().toISOString()}] ${message}\n`);
      break;
    case LogType.Level2:
      stream.write(`[${new Date().toISOString()}] ${message}`);
      break;
  }
}

export {
  LogType,
  LogCallback,
  logToStream
}