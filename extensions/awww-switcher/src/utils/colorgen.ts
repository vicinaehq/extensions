import { exec, execSync } from "child_process";

export const callColorGen = async (
  path: string,
  ColorGen: string,
): Promise<boolean> => {
  let command: string;

  switch (ColorGen.toLowerCase()) {
    case "matugen":
      command = `matugen image "${path}"`;
      break;

    case "pywal":
      command = `wal -i "${path}"`;
      break;

    case "wpgtk":
      command = `wpg -s "${path}"`;
      break;

    case "schemer2":
      command = `schemer2 "${path}"`;
      break;

    case "colorz":
      command = `colorz "${path}"`;
      break;

    case "haishoku":
      command = `python -c "from haishoku.haishoku import Haishoku; Haishoku.loadHaishoku('${path}')"`;
      break;

    case "wallust":
      command = `wallust run "${path}"`;
      break;

    default:
      console.warn(`Unknown color generator: ${ColorGen}.`);
      return false;
  }

  // Execute the command and check for errors
  return await new Promise<boolean>((resolve) => {
    exec(command, (error) => {
      if (error) {
        console.error(`Color generator failed: ${error.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};
