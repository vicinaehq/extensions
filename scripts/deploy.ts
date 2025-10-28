import path from 'path';
import { spawnSync } from 'child_process';
import fsp from 'fs/promises';
import { compressFolder, createZipFromFolder } from './zip-utils';

const [bin, script, extensionDir] = process.argv;

const STORE_BASE_URL = process.env.STORE_BASE_URL ?? 'http://localhost:3000';
const STORE_API_SECRET = process.env.STORE_API_SECRET ?? 'test';
const DIST = path.join(process.cwd(), './dist');

await fsp.rm(DIST, { recursive: true });
await fsp.mkdir(DIST, { recursive: true });

if (!extensionDir) {
	console.error(`Pass the extension directory as the first argument to this script.`);
	process.exit(1);
}

for (const dir of await fsp.readdir(extensionDir)) {
	const fullPath = path.join(extensionDir, dir);
	const info = await fsp.stat(fullPath);

	if (!info.isDirectory) {
		console.warn(`Skipping ${fullPath}: not a directory`);
		continue ;
	}

	console.log(`Installing npm dependencies for ${dir}...`);
	const res = spawnSync(`bun`, ['install'], { cwd: fullPath });
 
	if (res.status != 0) {
		console.error(`Failed to install dependencies: ${res.stderr}`);
		continue ;
	}

	const dist = path.join(DIST, dir);

	console.log('Dependency install was successful');
	console.log('Building extension');
	const buildRes = spawnSync(`bunx`, ['vici', 'build', '--out', dist], { cwd: fullPath });

	if (buildRes.status != 0) {
		console.error(`Failed to build extension ${buildRes.stderr}`);
		continue ;
	}
	console.log('Built.');

	const archive = await createZipFromFolder(dist)
	const blob = await archive.generateAsync({ type: 'blob', platform: 'UNIX', compression: 'DEFLATE' });
	const formData = new FormData;
	const file = new File([blob], `${dir}.zip`);

	formData.set('file', file);

	const uploadRes = await fetch(`${STORE_BASE_URL}/extension/upload`, {
		method: 'POST',
		headers: {
			//'Content-Type': 'multipart/form-data',
			'Authorization': `Bearer ${STORE_API_SECRET}`
		},
		body: formData
	});

	if (!uploadRes.ok) {
		console.error(`Failed to upload: ${await uploadRes.text()}`);
		continue ;
	}

	console.log('upload successfully');
}
