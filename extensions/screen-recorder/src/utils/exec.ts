import { exec } from "node:child_process";
import util from "node:util";

const execPromise = util.promisify(exec);

export { execPromise };
