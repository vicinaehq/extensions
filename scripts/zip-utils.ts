import JSZip from 'jszip';
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from 'node:path';

/**
 * Compresses a folder to the specified zip file.
 * @param {string} srcDir
 * @param {string} destFile
 */
export const compressFolder = async (
  srcDir: string,
  destFile: string
): Promise<void> => {
  //node write stream wants dest dir to already be created
  await fsp.mkdir(path.dirname(destFile), { recursive: true });

  const zip = await createZipFromFolder(srcDir);

  return new Promise((resolve, reject) => {
    zip
      .generateNodeStream({ streamFiles: true, compression: "DEFLATE" })
      .pipe(fs.createWriteStream(destFile))
      .on("error", (err) => reject(err))
      .on("finish", resolve);
  });
};

/**
 * Returns a flat list of all files and subfolders for a directory (recursively).
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
const getFilePathsRecursively = async (dir: string): Promise<string[]> => {
  // returns a flat array of absolute paths of all files recursively contained in the dir
  const list = await fsp.readdir(dir);
  const statPromises = list.map(async (file) => {
    const fullPath = path.resolve(dir, file);
    const stat = await fsp.stat(fullPath);
    if (stat && stat.isDirectory()) {
      return getFilePathsRecursively(fullPath);
    }
    return fullPath;
  });

  // cast to string[] is ts hack
  // see: https://github.com/microsoft/TypeScript/issues/36554
  return (await Promise.all(statPromises)).flat(
    Number.POSITIVE_INFINITY
  ) as string[];
};

/**
 * Creates an in-memory zip stream from a folder in the file system
 * @param {string} dir
 * @returns {Promise<JSZip>}
 */
export const createZipFromFolder = async (dir: string): Promise<JSZip> => {
  const absRoot = path.resolve(dir);
  const filePaths = await getFilePathsRecursively(dir);
  let zip = new JSZip();

  for (const path of filePaths) {
    const relative = path.replace(absRoot, "").slice(1);
	zip = zip.file(relative, await fsp.readFile(path));
  }

  return zip;
};
