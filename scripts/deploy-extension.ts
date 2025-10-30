import path from 'path';
import { spawnSync } from 'child_process';
import fsp from 'fs/promises';
import { createZipFromFolder } from './zip-utils';

const STORE_BASE_URL = process.env.STORE_BASE_URL ?? 'http://localhost:3000/v1';
const STORE_API_SECRET = process.env.STORE_API_SECRET ?? 'test';
const DIST = path.join(process.cwd(), './dist');

async function deployExtension(extensionName: string): Promise<boolean> {
	const fullPath = path.join(process.cwd(), 'extensions', extensionName);

	// Check if extension exists
	try {
		const stat = await fsp.stat(fullPath);
		if (!stat.isDirectory()) {
			console.error(`${fullPath} is not a directory`);
			return false;
		}
	} catch (error) {
		console.error(`Extension ${extensionName} not found at ${fullPath}`);
		return false;
	}

	console.log(`\n📦 Deploying ${extensionName}...`);

	// Install dependencies
	console.log(`Installing dependencies for ${extensionName}...`);
	const installRes = spawnSync('bun', ['install'], {
		cwd: fullPath,
		stdio: 'inherit'
	});

	if (installRes.status !== 0) {
		console.error(`❌ Failed to install dependencies for ${extensionName}`);
		return false;
	}

	// Build extension
	const dist = path.join(DIST, extensionName);
	await fsp.mkdir(dist, { recursive: true });

	console.log(`Building ${extensionName}...`);
	const buildRes = spawnSync('bunx', ['vici', 'build', '--out', dist], {
		cwd: fullPath,
		stdio: 'inherit'
	});

	if (buildRes.status !== 0) {
		console.error(`❌ Failed to build ${extensionName}`);
		return false;
	}

	console.log(`✅ Built ${extensionName}`);
	console.log(`Creating archive for ${extensionName}...`);

	const archive = await createZipFromFolder(dist);
	const blob = await archive.generateAsync({
		type: 'blob',
		platform: 'UNIX',
		compression: 'DEFLATE'
	});
	const file = new File([blob], `${extensionName}.zip`);

	// Upload to store
	console.log(`Uploading ${extensionName} to store...`);
	const formData = new FormData();
	formData.set('file', file);

	const uploadRes = await fetch(`${STORE_BASE_URL}/store/upload`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${STORE_API_SECRET}`
		},
		body: formData
	});

	if (!uploadRes.ok) {
		const errorText = await uploadRes.text();
		console.error(`❌ Failed to upload ${extensionName}: ${errorText}`);
		return false;
	}

	console.log(`✅ Successfully deployed ${extensionName}`);
	return true;
}

// Main execution
const [bin, script, ...extensionNames] = process.argv;

if (extensionNames.length === 0) {
	console.error('Usage: bun scripts/deploy-extension.ts <extension1> [extension2] [...]');
	console.error('Example: bun scripts/deploy-extension.ts port-killer case-converter');
	process.exit(1);
}

// Ensure dist directory exists
await fsp.mkdir(DIST, { recursive: true });

let successCount = 0;
let failCount = 0;

for (const extensionName of extensionNames) {
	const success = await deployExtension(extensionName);
	if (success) {
		successCount++;
	} else {
		failCount++;
	}
}

console.log('\n' + '='.repeat(50));
console.log(`✅ Deployed: ${successCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log('='.repeat(50));

if (failCount > 0) {
	process.exit(1);
}
