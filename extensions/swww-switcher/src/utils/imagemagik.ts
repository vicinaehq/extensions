import { exec, execSync } from "child_process";
import * as path from "node:path";

export async function runConvertSplit(imgpath: string) {
  const outDir = ".cache/vicinae/swww-switcher";
  console.log(`Running split of ${imgpath}`);

  const cmd = `mkdir -p "${outDir}" && magick "${imgpath}" -crop 50%x100% +repage "${outDir}/split_%d.jpg"`;
  execSync(cmd);

  return Array.from({ length: 2 }, (_, i) =>
    path.join(outDir, `split_${i}.jpg`),
  );
}

export const runPostProduction = async (
  imgpath: string,
  option: string,
): Promise<boolean> => {
  const outDir = ".cache/vicinae/swww-switcher";
  let cmd: string;
  const postProdpath = path.join(outDir, `postprod.jpg`);

  console.log(`Running '${option}' post production and saving ${postProdpath}`);
  switch (option.toLowerCase()) {
    case "grayscale":
      cmd = `magick ${imgpath} -set colorspace Gray -separate -average ${postProdpath}`;
      break;

    case "grayscaleblur":
      cmd = `magick ${imgpath} -set colorspace Gray -separate -average ${postProdpath} && magick ${postProdpath} -blur "6x6" ${postProdpath}`;
      break;

    case "grayscaleheavyblur":
      cmd = `magick ${imgpath} -set colorspace Gray -separate -average ${postProdpath} && magick ${postProdpath} -blur "12x12" ${postProdpath}`;
      break;

    case "lightblur":
      cmd = `magick ${imgpath} -blur "10x10" ${postProdpath}`;
      break;

    case "lightblurdarken":
      cmd = `magick ${imgpath} -blur "10x10" ${postProdpath} && magick ${postProdpath} -brightness-contrast -20% ${postProdpath}`;
      break;

    case "heavyblur":
      cmd = `magick ${imgpath} -blur "15x15" ${postProdpath}`;
      break;

    case "heavyblurdarken":
      cmd = `magick ${imgpath} -blur "15x15" ${postProdpath} && magick ${postProdpath} -brightness-contrast -20% ${postProdpath}`;
      break;

    case "negate":
      cmd = `magick ${imgpath} -negate ${postProdpath}`;
      break;

    default:
      console.warn(`Unknown post production option: ${option}.`);
      return false;
  }

  // Execute the command and check for errors
  return await new Promise<boolean>((resolve) => {
    exec(cmd, (error) => {
      if (error) {
        console.error(`Post processing failed: ${error.message}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};
