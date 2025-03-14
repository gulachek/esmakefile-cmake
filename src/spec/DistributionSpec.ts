/*
 * Copyright (C) 2025 Nicholas Gulachek
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA
 * 02111-1307, USA.
 */
import { expect } from 'chai';
import { Distribution, LibraryType, addCompileCommands } from '../index.js';
import {
	Makefile,
	PathLike,
	experimental,
	Path,
	BuildPathLike,
} from 'esmakefile';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chdir, cwd } from 'node:process';
import { run } from './run.js';
import { cmake } from './cmake.js';
import { installUpstream } from './upstream.js';

const testDir = resolve('.test');
const srcDir = join(testDir, 'src');
const buildDir = join(testDir, 'build');
const stageDir = join(testDir, 'stage');
const includeDir = join(testDir, 'include');
const vendorDir = join(testDir, 'vendor');
const cmakeDir = join(vendorDir, 'lib', 'cmake');
const pkgconfigDir = join(vendorDir, 'lib', 'pkgconfig');

async function updateTarget(
	make: Makefile,
	goal?: BuildPathLike,
): Promise<void> {
	const { result, recipes, errors, warnings } = await experimental.updateTarget(
		make,
		goal,
	);

	if (!result || warnings.length > 0) {
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

describe('Distribution', function () {
	this.timeout(60000); // 2 sec too short for these specs. MS cmake config takes ~20s
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
		await cmake.configure({
			build: stageDir,
			src: join(testDir, `${d.name}-${d.version}`),
			prefixPath: [vendorDir],
		});

		// Specify config b.c. default for MS is Debug for --build and Release for --install
		await cmake.build(stageDir, { config: 'Release' });

		await cmake.install(stageDir, { prefix: vendorDir });
		await rm(stageDir, { recursive: true });
	}

	describe('development', () => {
		let prevDir: string = '';

		beforeEach(async () => {
			make = new Makefile({
				srcRoot: testDir,
				buildRoot: buildDir,
			});

			await mkdir(includeDir, { recursive: true });
			await mkdir(srcDir, { recursive: true });
			prevDir = cwd();
			chdir(testDir);
		});

		afterEach(async () => {
			chdir(prevDir);
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

		it('updates when source updates', async () => {
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

			await writePath(
				'src/hello.c',
				'#include <stdio.h>',
				'int main(){ printf("hi."); return 0; }',
			);

			await expectOutput(hello.binary, 'hi.');
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

		// TODO for library too
		it('links mixed c/c++ as a c++ executable', async () => {
			await writePath(
				'src/hello.cpp',
				'#include <cstdio>',
				'extern "C" void hello(){ std::printf("hello!"); }',
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
				src: ['src/main.c', 'src/hello.cpp'],
			});

			await expectOutput(hello.binary, 'hello!');
		});

		it('can specify c11', async () => {
			await writePath(
				'src/printv.c',
				'#include <stdio.h>',
				'int main(){',
				'printf("%ld", __STDC_VERSION__);',
				'return 0;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
				cStd: 11,
			});

			const t = d.addExecutable({
				name: 'printv',
				src: ['src/printv.c'],
			});

			await expectOutput(t.binary, '201112');
		});

		it('can specify c17', async () => {
			await writePath(
				'src/printv.c',
				'#include <stdio.h>',
				'int main(){',
				'printf("%ld", __STDC_VERSION__);',
				'return 0;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
				cStd: 17,
			});

			const t = d.addExecutable({
				name: 'printv',
				src: ['src/printv.c'],
			});

			await expectOutput(t.binary, '201710');
		});

		it('can specify c++17', async () => {
			await writePath(
				'src/printv.cpp',
				'#include <cstdio>',
				...cxxLangMacro,
				'int main(){',
				'std::printf("%ld", CXXLANG);',
				'return 0;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
				cxxStd: 17,
			});

			const t = d.addExecutable({
				name: 'printv',
				src: ['src/printv.cpp'],
			});

			await expectOutput(t.binary, '201703');
		});

		it('can specify c++20', async () => {
			await writePath(
				'src/printv.cpp',
				'#include <cstdio>',
				...cxxLangMacro,
				'int main(){',
				'std::printf("%ld", CXXLANG);',
				'return 0;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
				cxxStd: 20,
			});

			const t = d.addExecutable({
				name: 'printv',
				src: ['src/printv.cpp'],
			});

			await expectOutput(t.binary, '202002');
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

		it('recompiles after updating header', async () => {
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

			await writePath('include/val.h', '#define VAL 5');
			await expectOutput(hello.binary, '5');
		});

		it('compiles and links libraries', async () => {
			await writePath('include/add.h', 'int add(int a, int b);');

			await writePath('include/zero.h', 'int zero();');
			await writePath(
				'src/zero.c',
				'#include "zero.h"',
				'int zero() { return 0; }',
			);

			await writePath(
				'src/add.c',
				'#include "add.h"',
				'#include "zero.h"',
				'int add(int a, int b){ return a + b + zero(); }',
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

			const zero = d.addLibrary({
				name: 'zero',
				src: ['src/zero.c'],
			});

			const add = d.addLibrary({
				name: 'add',
				src: ['src/add.c'],
				linkTo: [zero],
			});

			const test = d.addExecutable({
				name: 'test',
				src: ['src/main.c'],
				linkTo: [add],
			});

			await expectOutput(test.binary, '4');
		});

		it('carries includes from linked libraries', async () => {
			const customInclude = join(testDir, 'custom-include');
			await mkdir(customInclude);

			await writePath('custom-include/add.h', 'int add(int a, int b);');

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
				includeDirs: ['custom-include'],
			});

			const test = d.addExecutable({
				name: 'test',
				src: ['src/main.c'],
				linkTo: [add],
			});

			await expectOutput(test.binary, '4');
		});

		describe('external packages', () => {
			beforeEach(async () => {
				// General strategy - build one distribution and hand-craft
				// pkgconfig file to that distribution's build. Can test
				// generation of installed pkgconfig in installation tests
				await mkdir(join(testDir, 'dep', 'include'), { recursive: true });
				await mkdir(join(testDir, 'dep', 'src'));
				await mkdir(pkgconfigDir, { recursive: true });

				const dep = new Distribution(make, {
					name: 'dep',
					version: '2.3.4',
				});

				await writePath('dep/include/add.h', 'int add(int a, int b);');

				await writePath(
					'dep/src/add.c',
					'#include "add.h"',
					'int add(int a, int b){ return a + b; }',
				);

				const add = dep.addLibrary({
					name: 'add',
					src: ['dep/src/add.c'],
					includeDirs: ['dep/include'],
				});

				await updateTarget(make, add.binary);

				const depInclude = make.abs(Path.src('dep/include'));
				const libDir = make.abs(add.binary.dir());
				let cflags = `-I${depInclude}`;
				let libs = `-L${libDir} -ladd`;
				if (platform() === 'win32') {
					cflags = `/I${depInclude.replace(/\\/g, '\\\\')}`;
					libs = make.abs(add.binary).replace(/\\/g, '\\\\');
				}

				await writePath(
					'vendor/lib/pkgconfig/add.pc',
					'Name: add',
					'Version: 2.3.4',
					'Description: add two integers',
					`Cflags: ${cflags}`,
					`Libs: ${libs}`,
				);

				await writePath(
					'src/test.c',
					'#include <add.h>',
					'#include <stdio.h>',
					'int main() { printf("2+2=%d", add(2,2)); return 0; }',
				);
			});

			it('can find an external package for linking', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage('add');

				const test = d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [addPkg],
				});

				await expectOutput(test.binary, '2+2=4');
			});

			it('can specify a pkgconfig version', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage({
					pkgconfig: 'add = 2.3.4',
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [addPkg],
				});

				await expectOutput(test.binary, '2+2=4');
			});

			it('fails if incompatible version specified', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage({
					pkgconfig: 'add < 2.3.4',
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [addPkg],
				});

				const { result } = await experimental.updateTarget(make, test.binary);
				expect(result).to.be.false;
			});

			it('can specify an external package for linking differently between pkgconfig and cmake', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage({
					pkgconfig: 'add',
					cmake: 'not-used-in-test',
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [addPkg],
				});

				await expectOutput(test.binary, '2+2=4');
			});

			it('can find an external package for linking to a library', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage('add');

				await writePath(
					'include/mul.h',
					...defineExport,
					'EXPORT int mul(int a, int b);',
				);

				await writePath(
					'src/mul.c',
					'#include "mul.h"',
					'#include <add.h>',
					'int mul(int a, int b) {',
					' int sum = 0;',
					' for(int i = 0; i < a; ++i) {',
					'  sum = add(sum, b);',
					' }',
					' return sum;',
					'}',
				);

				await writePath(
					'src/test.c',
					'#include "mul.h"',
					'#include <stdio.h>',
					'int main() { printf("2*3=%d", mul(2,3)); return 0; }',
				);

				const mul = d.addLibrary({
					name: 'mul',
					src: ['src/mul.c'],
					linkTo: [addPkg],
					type: LibraryType.dynamic,
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [mul],
				});

				await expectOutput(test.binary, '2*3=6');
			});

			it('can specify a CMake version', async () => {
				await writePath('LICENSE.txt', 'Test license');

				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const addPkg = d.findPackage({
					pkgconfig: 'add',
					cmake: {
						packageName: 'add',
						version: '2.3.4',
						libraryTargetName: 'add',
					},
				});

				d.addExecutable({
					name: 'test',
					src: ['src/test.c'],
					linkTo: [addPkg],
				});

				await updateTarget(make, d.dist);

				const cmake = Path.build('test-1.2.3/CMakeLists.txt');
				const cmakeContents = await readFile(make.abs(cmake), 'utf8');

				const lines = cmakeContents.split('\n');
				const re = /^find_package\(add\s+2.3.4\s+REQUIRED\)$/;
				const l = lines.find((l) => l.match(re));

				expect(l, 'Did not find match').not.to.be.empty;
			});
		});

		it('can add a unit test executable', async () => {
			await mkdir(join(testDir, 'test'));
			await writePath('include/add.h', 'int add(int a, int b);');
			await writePath('src/add.c', 'int add(int a, int b) { return a + b; }');

			await writePath(
				'test/add_test.c',
				'#include "add.h"',
				'int main() {',
				'return add(2,2) != 4;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'add',
				version: '1.2.3',
			});

			const add = d.addLibrary({
				name: 'add',
				src: ['src/add.c'],
			});

			const { run } = d.addTest({
				name: 'add_test',
				src: ['test/add_test.c'],
				linkTo: [add],
			});

			await updateTarget(make, run);

			// also make sure test-add rule works
			await rm(buildDir, { recursive: true });

			expect(d.test.rel()).to.equal('test-add');
			await updateTarget(make, 'test-add');
		});

		describe('static vs dynamic', () => {
			beforeEach(async () => {
				await writePath(
					'include/image_name.h',
					...defineExport,
					'EXPORT int image_name(char *dst, int sz);',
				);

				await writePath(
					'src/image_name.c',
					'#ifdef __linux__',
					'#define _GNU_SOURCE', // needed for Dl_info
					'#endif',
					'#include <string.h>',
					'#include "image_name.h"',
					'#ifdef _WIN32',
					'#include <windows.h>',
					'int image_name(char *dst, int sz){',
					' HMODULE module;',
					' GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, (LPCSTR)image_name, &module);',
					' GetModuleFileNameA(module, dst, sz);',
					' return 1;',
					'}',
					'#else',
					'#include <dlfcn.h>',
					'int image_name(char *dst, int sz){',
					'	Dl_info info;',
					'	if (dladdr(image_name, &info)){',
					'		strlcpy(dst, info.dli_fname, sz);',
					'		return 1;',
					'	} else {',
					'		return 0;',
					'	}',
					'}',
					'#endif',
				);

				await writePath(
					'src/main.c',
					'#include "image_name.h"',
					'#include <stdio.h>',
					'int main(){',
					'	char buf[1024];',
					'	if (!image_name(buf, sizeof(buf))) return 1;',
					'	printf("%s", buf);',
					'	return 0;',
					'}',
				);
			});

			it('is static by default', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(test.binary));
			});

			it('is static when explicitly set to default type', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
					type: LibraryType.default,
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(test.binary));
			});

			it('is static when explicitly set to static', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
					type: LibraryType.static,
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(test.binary));
			});

			it('is dynamic when explicitly set to dynamic', async () => {
				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
					type: LibraryType.dynamic,
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(img.binary));
			});

			it('is dynamic when default is set to dynamic', async () => {
				await writePath(
					'test-config.json',
					JSON.stringify({
						'build-shared-libs': true,
					}),
				);

				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(img.binary));
			});

			it('is dynamic when default is set to dynamic and library has explicit default type', async () => {
				await writePath(
					'test-config.json',
					JSON.stringify({
						'build-shared-libs': true,
					}),
				);

				const d = new Distribution(make, {
					name: 'test',
					version: '1.2.3',
				});

				const img = d.addLibrary({
					name: 'image_name',
					src: ['src/image_name.c'],
					type: LibraryType.default,
				});

				const test = d.addExecutable({
					name: 'test',
					src: ['src/main.c'],
					linkTo: [img],
				});

				await expectOutput(test.binary, make.abs(img.binary));
			});
		});

		it('generates a compile_commands.json file', async () => {
			await mkdir(pkgconfigDir, { recursive: true });

			const add = Path.src('src/add.c');
			const test = Path.src('src/test.c');

			await writePath('include/add.h', 'int add(int a, int b);');

			await writePath(
				add,
				'#include "add.h"',
				'int add(int a, int b) { return a + b; }',
			);

			await writePath(
				test,
				'#include "add.h"',
				'int main() { return add(TEST_FRAMEWORK_VERSION,-TEST_FRAMEWORK_VERSION); }',
			);

			await writePath(
				'vendor/lib/pkgconfig/test-framework.pc',
				'Name: test-framework',
				'Version:',
				'Description:',
				'Cflags: -DTEST_FRAMEWORK_VERSION=123',
			);

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
			});

			const addLib = d.addLibrary({
				name: 'add',
				src: [add],
			});

			const testFramework = d.findPackage('test-framework');

			d.addTest({
				name: 'test',
				src: [test],
				linkTo: [addLib, testFramework],
			});

			const commands = addCompileCommands(make, d);

			await updateTarget(make, commands);

			const clangCheck = process.env['CLANG_CHECK'];
			expect(clangCheck).not.to.be.empty;
			await run(clangCheck, [
				'-p',
				make.buildRoot,
				make.abs(add),
				make.abs(test),
			]);
		});
	});

	describe('installation', () => {
		let oldDir: string = '';
		let distArchive: Path;

		before(async () => {
			make = new Makefile({
				srcRoot: testDir,
				buildRoot: buildDir,
			});

			await mkdir(includeDir, { recursive: true });
			await mkdir(srcDir, { recursive: true });
			await mkdir(pkgconfigDir, { recursive: true });
			await mkdir(cmakeDir, { recursive: true });

			oldDir = cwd();
			chdir(testDir);

			await writePath('LICENSE.txt', 'This is a test license!');

			// add a silly package in pkg-config and cmake that
			// defines ZERO
			await writePath(
				'vendor/lib/pkgconfig/zero.pc',
				'Name: zero',
				'Version: 0',
				'Description: nada',
				'Cflags: -DZERO=0',
			);

			await mkdir(join(cmakeDir, 'zero'));
			await writePath(
				'vendor/lib/cmake/zero/zero-config.cmake',
				'add_library(zero INTERFACE)',
				'target_compile_definitions(zero INTERFACE ZERO=0)',
			);

			await writePath(
				'src/printv.c',
				'#include <stdio.h>',
				'int main(){ printf("%ld", __STDC_VERSION__); return 0; }',
			);

			await writePath(
				'src/printvxx.cpp',
				'#include <cstdio>',
				...cxxLangMacro,
				'int main(){ std::printf("%ld", CXXLANG); return 0; }',
			);

			await writePath('include/add.h', 'int add(int a, int b);');
			await writePath(
				'src/add.c',
				'#include "add.h"',
				'#include <one.h>',
				'int add(int a, int b) { return one() * (a + b); }',
			);

			await writePath(
				'src/test_upstream.c',
				'#include <two.h>',
				'#include <hello.h>',
				'#include <world.h>',
				'#include <assert.h>',
				'#include <stdio.h>',
				'#include <string.h>',
				'int main() {',
				' assert(two()+two() == 4);',
				' assert(strcmp(hello(), "hello") == 0);',
				' assert(strcmp(world(), "world") == 0);',
				' printf("success!");',
				'	return 0;',
				'}',
			);

			await writePath('src/unit_test.c', 'int main() { return 0; }');

			const genC = Path.build('gen.c');
			make.add(genC, async () => {
				await writePath(
					genC,
					'#include <stdio.h>',
					'int main() {',
					'printf("generated!");',
					'return ZERO;',
					'}',
				);
			});

			await installUpstream(stageDir, vendorDir);
			await rm(stageDir, { recursive: true });

			const d = new Distribution(make, {
				name: 'test',
				version: '1.2.3',
				cStd: 11,
				cxxStd: 20,
			});

			distArchive = d.dist;

			const notFound = d.findPackage('not-found');
			const zero = d.findPackage('zero');
			const one = d.findPackage({
				pkgconfig: 'libone',
				cmake: 'one',
			});

			const two = d.findPackage({
				pkgconfig: 'two',
				cmake: {
					packageName: 'Two2',
					version: '2',
					libraryTargetName: 'two',
				},
			});

			const hello = d.findPackage({
				pkgconfig: 'hello',
				cmake: {
					packageName: 'HelloWorld',
					component: 'hello',
					libraryTargetName: 'HelloWorld::hello',
				},
			});

			const world = d.findPackage({
				pkgconfig: 'world',
				cmake: {
					packageName: 'HelloWorld',
					component: 'world',
					libraryTargetName: 'HelloWorld::world',
				},
			});

			const printv = d.addExecutable({
				name: 'printv',
				src: ['src/printv.c'],
			});

			const printvxx = d.addExecutable({
				name: 'printv++',
				src: ['src/printvxx.cpp'],
			});

			const add = d.addLibrary({
				name: 'add',
				src: ['src/add.c'],
				linkTo: [one],
			});

			const testUpstream = d.addExecutable({
				name: 'test_upstream',
				src: ['src/test_upstream.c'],
				linkTo: [two, hello, world],
			});

			d.addTest({
				name: 'unit_test',
				src: ['src/unit_test.c'],
				// This makes sure that distribution doesn't do
				// find_package on unit test dependencies
				linkTo: [notFound],
			});

			const gen = d.addExecutable({
				name: 'gen',
				src: [genC],
				linkTo: [zero],
			});

			// TODO - install multiple in same call
			d.install(printv);
			d.install(printvxx);
			d.install(add);
			d.install(gen);
			d.install(testUpstream);

			await install(d);
		});

		after(async () => {
			chdir(oldDir);
			await rm(testDir, { recursive: true });
		});

		it('installs an executable', async () => {
			await expectOutput('vendor/bin/printv', '201112');
			await expectOutput('vendor/bin/printv++', '202002');
		});

		it('can install a target with generated source', async () => {
			await expectOutput('vendor/bin/gen', 'generated!');
		});

		it('passes upstream checks', async () => {
			await expectOutput('vendor/bin/test_upstream', 'success!');
		});

		it('does not install a test', () => {
			// first check printv to make sure we're in the right directory (avoid success by accident)
			if (platform() === 'win32') {
				expect(existsSync('vendor\\bin\\printv.exe')).to.be.true;
				expect(existsSync('vendor\\bin\\unit_test.exe')).to.be.false;
			} else {
				expect(existsSync('vendor/bin/printv')).to.be.true;
				expect(existsSync('vendor/bin/unit_test')).to.be.false;
			}
		});

		it('copies expected files to distribution', () => {
			// just to make sure we're in right cwd
			const result = spawnSync('tar', ['tfz', make.abs(distArchive)], {
				encoding: 'utf8',
			});

			const p = 'test-1.2.3';
			const output = result.output.join('').split(/\r?\n/);
			expect(output).to.contain(`${p}/LICENSE.txt`); // license
			expect(output).to.contain(`${p}/src/printv.c`); // src
			expect(output).not.to.contain(`${p}/src/unit_test.c`); // test
		});

		it('installs a library w/ pkgconfig', async () => {
			await writePath(
				'src/print.c',
				'#include <stdio.h>',
				'#include <add.h>',
				'int main() {',
				'printf("2+2=%d", add(2,2));',
				'return 0;',
				'}',
			);

			const d = new Distribution(make, {
				name: 'math',
				version: '1.1.1',
			});

			const add = d.findPackage('add');

			const print = d.addExecutable({
				name: 'print',
				src: ['src/print.c'],
				linkTo: [add],
			});

			await expectOutput(print.binary, '2+2=4');
		});

		it('installs a CMake package for library', async () => {
			await writePath(
				'src/print.c',
				'#include <stdio.h>',
				'#include <add.h>',
				'int main() {',
				'printf("2+2=%d", add(2,2));',
				'return 0;',
				'}',
			);

			await writePath(
				'CMakeLists.txt',
				'cmake_minimum_required(VERSION 3.10)',
				'project(Test)',
				'find_package(add REQUIRED)',
				'add_executable(print src/print.c)',
				'target_link_libraries(print PRIVATE add)',
			);

			await rm(buildDir, { recursive: true });
			await cmake.configure({
				src: testDir,
				build: buildDir,
				prefixPath: [vendorDir],
			});
			await cmake.build(buildDir);
			expectOutput(join(buildDir, 'print'), '2+2=4');
		});
	});
});

/** Defines CXXLANG macro from __cplusplus or _MSVC_LANG */
const cxxLangMacro = [
	'#ifdef _MSVC_LANG',
	'#define CXXLANG _MSVC_LANG',
	'#else',
	'#define CXXLANG __cplusplus',
	'#endif',
];

const defineExport = [
	'#ifdef _WIN32',
	'#define EXPORT __declspec(dllexport)',
	'#else',
	'#define EXPORT',
	'#endif',
];
