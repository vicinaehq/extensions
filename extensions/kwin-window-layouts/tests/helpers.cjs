const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = resolve(__dirname, "..");

function loadSource(filename, mocks = {}, globals = {}) {
	const source = readFileSync(filename, "utf8");
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
		},
	}).outputText;
	const exports = {};
	vm.runInNewContext(
		compiled,
		{
			exports,
			Error,
			process,
			console,
			setTimeout,
			require(name) {
				if (Object.hasOwn(mocks, name)) return mocks[name];
				if (name.startsWith(".")) {
					return loadSource(
						resolve(dirname(filename), `${name}.ts`),
						mocks,
						globals,
					);
				}
				return require(name);
			},
			...globals,
		},
		{ filename },
	);
	return exports;
}

module.exports = { root, loadSource };
