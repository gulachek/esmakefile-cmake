import { expect } from 'chai';
import { Distribution } from '../index.js';
import {
	Makefile,
	PathLike,
	experimental,
	Path,
	BuildPathLike,
} from 'esmakefile';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync, SpawnSyncOptions } from 'node:child_process';

const testDir = '.test';
const srcDir = join(testDir, 'src');
const buildDir = join(testDir, 'build');
const stageDir = join(testDir, 'stage');
const includeDir = join(testDir, 'include');

async function updateTarget(
	make: Makefile,
	goal?: BuildPathLike,
): Promise<void> {
	const { result, recipes, errors, warnings } = await experimental.updateTarget(
		make,
		goal,
	);

	if (!result) {
		for (const [id, r] of recipes) {
			const { result, consoleOutput } = r;
			const t = make.rule(id).targets();
			console.log(`${t} (${result}):`, consoleOutput);
		}
	}

	for (const e of errors) {
		console.error('Error:', e.msg);
	}

	for (const w of warnings) {
		console.warn('Warning:', w.msg);
	}

	expect(result).to.be.true;
	expect(errors.length).to.equal(0);
	expect(warnings.length).to.equal(0);
}

async function run(cmd: string): Promise<void>;
async function run(cmd: string, args: string[]): Promise<void>;
async function run(cmd: string, opts: SpawnSyncOptions): Promise<void>;
async function run(
	cmd: string,
	args: string[],
	opts: SpawnSyncOptions,
): Promise<void>;
async function run(
	cmd: string,
	argsOrOpts?: string[] | SpawnSyncOptions,
	maybeOpts?: SpawnSyncOptions,
): Promise<void> {
	let args: string[] | undefined = undefined;
	let opts: SpawnSyncOptions | undefined = undefined;

	if (Array.isArray(argsOrOpts)) {
		args = argsOrOpts;
		opts = maybeOpts;
	} else {
		opts = argsOrOpts;
	}

	const optsToUse: SpawnSyncOptions = { encoding: 'utf8' };
	if (opts) {
		Object.assign(optsToUse, opts);
	}

	const result = spawnSync(cmd, args, optsToUse);
	if (result.error) {
		console.error(cmd, args, 'Encountered error:', result.error);
		throw result.error;
	}

	if (result.status !== 0) {
		console.error(cmd, args, 'returned exit code:', result.status);
		console.log((result.output as string[]).join(''));
		throw new Error(`${cmd} returned nonzero exit code`);
	}
}

describe('Distribution', function () {
	this.timeout(10000); // 2 sec too short for these specs
	let make: Makefile;

	function writePath(src: PathLike, ...lines: string[]): Promise<void> {
		let sep = platform() === 'win32' ? '\r\n' : '\n';
		return writeFile(make.abs(Path.src(src)), lines.join(sep), 'utf8');
	}

	async function expectOutput(p: PathLike, output: string): Promise<void> {
		const path = Path.src(p);
		if (path.isBuildPath()) {
			await updateTarget(make, path);
		}

		const { stdout } = spawnSync(make.abs(path), { encoding: 'utf8' });
		expect(stdout).to.equal(output);
	}

	async function install(d: Distribution): Promise<void> {
		await updateTarget(make, d.dist);

		await run('tar', ['xfvz', make.abs(d.dist)], {
			cwd: testDir,
			encoding: 'utf8',
		});

		await mkdir(stageDir);
		await run('cmake', ['-B', stageDir, '-S', join(testDir, 'test-1.2.3')]);
		await run('cmake', ['--build', stageDir]);
		await run('cmake', ['--install', stageDir, '--prefix', testDir]);
	}

	beforeEach(async () => {
		make = new Makefile({
			srcRoot: testDir,
			buildRoot: buildDir,
		});

		await mkdir(includeDir, { recursive: true });
		await mkdir(srcDir);
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true });
	});

	it('builds a single file executable', async () => {
		await writePath(
			'src/hello.c',
			'#include <stdio.h>',
			'int main(){ printf("hello!"); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'hello',
			version: '1.2.3',
		});

		const hello = d.addExecutable({
			name: 'hello',
			src: ['src/hello.c'],
		});

		await expectOutput(hello.binary, 'hello!');
	});

	it('can compile multiple source file exe', async () => {
		await writePath(
			'src/hello.c',
			'#include <stdio.h>',
			'void hello(){ printf("hello!"); }',
		);

		await writePath(
			'src/main.c',
			'extern void hello();',
			'int main(){ hello(); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'hello',
			version: '1.2.3',
		});

		const hello = d.addExecutable({
			name: 'hello',
			src: ['src/main.c', 'src/hello.c'],
		});

		await expectOutput(hello.binary, 'hello!');
	});

	it('includes the "include" dir by default', async () => {
		await writePath('include/val.h', '#define VAL 4');

		await writePath(
			'src/main.c',
			'#include "val.h"',
			'#include <stdio.h>',
			'int main(){ printf("%d", VAL); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		const hello = d.addExecutable({
			name: 'test',
			src: ['src/main.c'],
		});

		await expectOutput(hello.binary, '4');
	});

	it('compiles and links libraries', async () => {
		await writePath('include/add.h', 'int add(int a, int b);');

		await writePath(
			'src/add.c',
			'#include "add.h"',
			'int add(int a, int b){ return a + b; }',
		);

		await writePath(
			'src/main.c',
			'#include "add.h"',
			'#include <stdio.h>',
			'int main(){ printf("%d", add(2,2)); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		const add = d.addLibrary({
			name: 'add',
			src: ['src/add.c'],
		});

		const test = d.addExecutable({
			name: 'test',
			src: ['src/main.c'],
			linkTo: [add],
		});

		await expectOutput(test.binary, '4');
	});

	it('installs an executable', async () => {
		await writePath(
			'src/main.c',
			'#include "stdio.h"',
			'int main(){ printf("hello!"); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		d.addExecutable({
			name: 'test',
			src: ['src/main.c'],
		});

		await install(d);

		expectOutput('bin/test', 'hello!');
	});

	// TODO
	// custom include dirs
	// addLibrary
	// header only library
	// distribution
	// installing distribution
	// linking to library
	// pkgConfig
	// compile_commands.json
	// custom compiler
	// custom cflags
});
