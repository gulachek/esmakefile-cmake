import { expect } from 'chai';
import { Distribution } from '../index.js';
import {
	Makefile,
	PathLike,
	experimental,
	Path,
	BuildPathLike,
	IBuildPath,
} from 'esmakefile';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';

const testDir = '.test';
const srcDir = join(testDir, 'src');
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
			console.log(`Rule ID ${id} (${result}):`, consoleOutput);
		}
	}

	expect(result).to.be.true;
	expect(errors.length).to.equal(0);
	expect(warnings.length).to.equal(0);
}

describe('Distribution', () => {
	let make: Makefile;

	function writePath(src: PathLike, ...lines: string[]): Promise<void> {
		let sep = platform() === 'win32' ? '\r\n' : '\n';
		return writeFile(make.abs(Path.src(src)), lines.join(sep), 'utf8');
	}

	async function expectOutput(goal: IBuildPath, output: string): Promise<void> {
		await updateTarget(make, goal);

		const { stdout } = spawnSync(make.abs(goal), { encoding: 'utf8' });
		expect(stdout).to.equal(output);
	}

	beforeEach(async () => {
		make = new Makefile({
			srcRoot: testDir,
			buildRoot: join(testDir, 'build'),
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

		await expectOutput(hello.path, 'hello!');
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

		await expectOutput(hello.path, 'hello!');
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

		await expectOutput(hello.path, '4');
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

		await expectOutput(test.path, '4');
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
