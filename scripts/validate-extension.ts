import path from 'path';
import fsp from 'fs/promises';
import manifestSchema from '../schemas/manifest';

interface ValidationError {
	extension: string;
	field: string;
	message: string;
}

async function validateGitHubUser(username: string): Promise<boolean> {
	try {
		const response = await fetch(`https://api.github.com/users/${username}`, {
			headers: {
				'Accept': 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
				// Use token if available to avoid rate limiting
				...(process.env.GITHUB_TOKEN && {
					'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
				})
			}
		});

		return response.ok;
	} catch (error) {
		console.warn(`⚠️  Could not verify GitHub user ${username}: ${error}`);
		return true; // Don't fail on network errors
	}
}

async function validateExtension(extensionName: string, checkGitHub = true): Promise<ValidationError[]> {
	const errors: ValidationError[] = [];
	const extensionPath = path.join(process.cwd(), 'extensions', extensionName);

	// Read package.json
	const packageJsonPath = path.join(extensionPath, 'package.json');
	const lockfile = path.join(extensionPath, "package-lock.json");
	let pkg: any;

	try {
		const content = await fsp.readFile(packageJsonPath, 'utf-8');
		pkg = JSON.parse(content);
	} catch (error) {
		errors.push({
			extension: extensionName,
			field: 'package.json',
			message: `Cannot read or parse package.json: ${error}`
		});
		return errors;
	}

	if (!await fsp.exists(lockfile)) {
		errors.push({
			extension: extensionName,
			field: 'package-lock.json',
			message: `A package-lock.json file is required. Please use 'npm install' to generate one.`
		});
	}

	// Validate against Zod schema
	const validationResult = manifestSchema.safeParse(pkg);

	if (!validationResult.success) {
		// Convert Zod errors to our error format
		for (const issue of validationResult.error.issues) {
			const fieldPath = issue.path.join('.');
			errors.push({
				extension: extensionName,
				field: fieldPath || 'package.json',
				message: issue.message
			});
		}
	}

	// Additional validation: Verify author is a real GitHub user
	if (pkg.author && checkGitHub) {
		const author = pkg.author.trim();
		const userExists = await validateGitHubUser(author);
		if (!userExists) {
			errors.push({
				extension: extensionName,
				field: 'author',
				message: `GitHub user "${author}" does not exist or could not be verified.`
			});
		}
	}

	// Additional validation: Verify contributors are real GitHub users
	if (pkg.contributors && Array.isArray(pkg.contributors) && checkGitHub) {
		for (const contributor of pkg.contributors) {
			const userExists = await validateGitHubUser(contributor);
			if (!userExists) {
				errors.push({
					extension: extensionName,
					field: 'contributors',
					message: `GitHub user "${contributor}" does not exist or could not be verified.`
				});
			}
		}
	}

	// Additional validation: Verify pastContributors are real GitHub users
	if (pkg.pastContributors && Array.isArray(pkg.pastContributors) && checkGitHub) {
		for (const contributor of pkg.pastContributors) {
			const userExists = await validateGitHubUser(contributor);
			if (!userExists) {
				errors.push({
					extension: extensionName,
					field: 'pastContributors',
					message: `GitHub user "${contributor}" does not exist or could not be verified.`
				});
			}
		}
	}

	return errors;
}

function printErrors(errors: ValidationError[]): void {
	const groupedErrors = errors.reduce((acc, error) => {
		if (!acc[error.extension]) {
			acc[error.extension] = [];
		}
		acc[error.extension].push(error);
		return acc;
	}, {} as Record<string, ValidationError[]>);

	for (const [extension, extensionErrors] of Object.entries(groupedErrors)) {
		console.log(`\n❌ ${extension}:`);
		for (const error of extensionErrors) {
			console.log(`   • ${error.field}: ${error.message}`);
		}
	}
}

// Main execution
const args = process.argv.slice(2);
const flags = args.filter(arg => arg.startsWith('--'));
const extensionNames = args.filter(arg => !arg.startsWith('--'));

const skipGitHubCheck = flags.includes('--skip-github-check');

if (extensionNames.length === 0) {
	console.error('Usage: bun scripts/validate-extension.ts <extension1> [extension2] [...] [--skip-github-check]');
	console.error('Example: bun scripts/validate-extension.ts port-killer case-converter');
	console.error('\nFlags:');
	console.error('  --skip-github-check    Skip GitHub user existence validation (faster, for local dev)');
	process.exit(1);
}

console.log('🔍 Validating extensions...\n');
if (skipGitHubCheck) {
	console.log('⚠️  Skipping GitHub user validation\n');
}

const allErrors: ValidationError[] = [];

for (const extensionName of extensionNames) {
	process.stdout.write(`Validating ${extensionName}... `);
	const errors = await validateExtension(extensionName, !skipGitHubCheck);

	if (errors.length === 0) {
		console.log('✅');
	} else {
		console.log('❌');
		allErrors.push(...errors);
	}
}

if (allErrors.length > 0) {
	printErrors(allErrors);
	console.log('\n' + '='.repeat(50));
	console.log(`❌ Validation failed with ${allErrors.length} error(s)`);
	console.log('='.repeat(50));
	process.exit(1);
} else {
	console.log('\n' + '='.repeat(50));
	console.log('✅ All extensions validated successfully!');
	console.log('='.repeat(50));
}
