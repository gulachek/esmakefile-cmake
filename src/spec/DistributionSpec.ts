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
	IBuildPath,
} from 'esmakefile';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chdir, cwd } from 'node:process';
import { run } from './run.js';

const globalTestDir = join(resolve('.test'), 'dev');

class Timer {
	ms: number;
	complete: boolean;

	private _resolve: () => void;
	private _timeout: NodeJS.Timeout;

	constructor(ms: number) {
		this.ms = ms;
		this.complete = false;
	}

	start(): Promise<void> {
		return new Promise<void>((res) => {
			this._resolve = res;
			this._timeout = setTimeout(() => this._fire(), this.ms);
		});
	}

	stop(): void {
		clearTimeout(this._timeout);
		this._resolve();
	}

	private _fire(): void {
		this._resolve();
		this.complete = true;
	}
}

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

	expect(errors.length).to.equal(0);
	expect(warnings.length).to.equal(0);
	expect(result).to.be.true;
}

(async function () {
	let make: Makefile;
	let testDir: string;
	let srcDir: string;
	let buildDir: string;
	let includeDir: string;
	let privateIncludeDir: string;
	let vendorDir: string;
	let pkgconfigDir: string;

	const allNames = new Set<string>();

	async function test(name: string, impl: () => Promise<void>): Promise<void> {
		if (allNames.has(name)) {
			throw new Error(`Duplicate name '${name}' passed to test(...)`);
		}
		allNames.add(name);

		testDir = join(globalTestDir, name);
		srcDir = join(testDir, 'src');
		buildDir = join(testDir, 'build');
		includeDir = join(testDir, 'include');
		privateIncludeDir = join(testDir, 'private', 'include');
		vendorDir = join(testDir, 'vendor');
		pkgconfigDir = join(vendorDir, 'lib', 'pkgconfig');

		await mkdir(testDir, { recursive: true });
		await mkdir(includeDir, { recursive: true });
		await mkdir(privateIncludeDir, { recursive: true });
		await mkdir(srcDir, { recursive: true });
		const prevDir = cwd();
		chdir(testDir);

		make = new Makefile({
			srcRoot: testDir,
			buildRoot: buildDir,
		});

		const t = new Timer(30000);

		try {
			await Promise.race([impl(), t.start()]);

			if (t.complete) {
				throw new Error(`Timed out (> ${t.ms} ms)`);
			} else {
				t.stop();
			}
		} catch (ex) {
			console.error('Test', name, 'failed: ', ex);
			process.exit(1);
		}

		chdir(prevDir);
	}

	function writeLines(rawPath: string, lines: string[]): Promise<void> {
		let sep = platform() === 'win32' ? '\r\n' : '\n';
		return writeFile(rawPath, lines.join(sep), 'utf8');
	}

	function addTextFile(path: BuildPathLike, ...lines: string[]): IBuildPath {
		const buildPath = Path.build(path);
		make.add(buildPath, (args) => {
			return writeLines(args.abs(buildPath), lines);
		});
		return buildPath;
	}

	function writePath(src: PathLike, ...lines: string[]): Promise<void> {
		return writeLines(make.abs(Path.src(src)), lines);
	}

	async function report(
		testCase: string | string[],
		fn: () => void | Promise<void>,
	) {
		let result = 0;
		try {
			await Promise.resolve(fn());
			result = 1;
		} finally {
			const cases = Array.isArray(testCase) ? testCase : [testCase];
			for (const t of cases) {
				console.log(`${t} = ${result}`);
			}
		}
	}

	async function expectOutput(p: PathLike, output: string): Promise<void> {
		const path = Path.src(p);
		if (path.isBuildPath()) {
			await updateTarget(make, path);
		}

		const { stdout } = spawnSync(make.abs(path), { encoding: 'utf8' });
		expect(stdout).to.equal(output);
	}

	await test('dev1', async () => {
		await writePath('include/hello.h', 'void hello();');
		await writePath('include/punct.h', "#define PUNCT '!'");
		await writePath('private/include/zero.h', '#define ZERO 0');

		await writePath(
			'src/hello.c',
			'#include "punct.h"',
			'#include <stdio.h>',
			'void hello(){ printf("hello%c", PUNCT); }',
		);

		const main = addTextFile(
			'src/main.c',
			'#include "hello.h"',
			'#include "zero.h"',
			'int main(){ hello(); return ZERO; }',
		);

		const d = new Distribution(make, {
			name: 'hello',
			version: '1.2.3',
		});

		const hello = d.addExecutable({
			name: 'hello',
			src: ['src/hello.c', main],
		});

		await report(
			[
				'e2e.dev.addExecutable.source-is-prereq',
				'e2e.dev.addExecutable.multi-source',
				'e2e.dev.addExecutable.default-include',
				'e2e.dev.addExecutable.default-private-include',
			],
			() => expectOutput(hello.binary, 'hello!'),
		);

		await writePath('include/punct.h', "#define PUNCT '?'");

		await report(['e2e.dev.addExecutable.header-is-postreq'], () =>
			expectOutput(hello.binary, 'hello?'),
		);
	});

	await test('dev2', async () => {
		await writePath(
			'src/hello.cpp',
			'#include <iostream>',
			'extern "C" void hello(){ std::cout << "hello!"; }',
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

		await report('e2e.dev.addExecutable.links-c-cxx-as-cxx', () =>
			expectOutput(hello.binary, 'hello!'),
		);
	});

	await test('dev3', async () => {
		await writePath(
			'src/one.cpp',
			'#include <string>',
			'extern "C" int one(){ return std::stoi("1"); }',
		);

		await writePath(
			'src/two.c',
			'extern int one();',
			...defineExport,
			'EXPORT int two(){ return one()+one(); }',
		);

		await writePath(
			'src/main.c',
			'#include <stdio.h>',
			'extern int two();',
			'int main(){ printf("%d", two()); return 0; }',
		);

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		const nums = d.addLibrary({
			name: 'nums',
			src: ['src/two.c', 'src/one.cpp'],
			type: LibraryType.dynamic, // make sure fully linked
		});

		const main = d.addExecutable({
			name: 'main',
			src: ['src/main.c'],
			linkTo: [nums],
		});

		await report('e2e.dev.addLibrary.links-c-cxx-as-cxx', () =>
			expectOutput(main.binary, '2'),
		);
	});

	await test('dev4', async () => {
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

		await report('e2e.dev.Distribution.c11-exe', () =>
			expectOutput(t.binary, '201112'),
		);
	});

	await test('dev5', async () => {
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

		await report('e2e.dev.Distribution.c17-exe', () =>
			expectOutput(t.binary, '201710'),
		);
	});

	await test('dev6', async () => {
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

		await report('e2e.dev.Distribution.cxx17-exe', () =>
			expectOutput(t.binary, '201703'),
		);
	});

	await test('dev7', async () => {
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

		await report('e2e.dev.Distribution.cxx20-exe', () =>
			expectOutput(t.binary, '202002'),
		);
	});

	await test('dev8', async () => {
		const customInclude = join(testDir, 'custom-include');
		await mkdir(customInclude);

		await writePath('custom-include/add.h', 'int add(int a, int b);');

		await writePath('include/zero.h', 'int zero();');
		await writePath('private/include/zero_impl.h', '#define ZERO 0');
		await writePath(
			'src/zero.c',
			'#include "zero.h"',
			'#include "zero_impl.h"',
			'int zero() { return ZERO; }',
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
			includeDirs: ['custom-include'],
			linkTo: [zero],
		});

		const test = d.addExecutable({
			name: 'test',
			src: ['src/main.c'],
			linkTo: [add],
		});

		await report(
			[
				'e2e.dev.addLibrary.default-include',
				'e2e.dev.addLibrary.default-private-include',
				'e2e.dev.addExecutable.links-transitive-library',
				'e2e.dev.addExecutable.includes-direct-dependency-dirs',
			],
			() => expectOutput(test.binary, '4'),
		);
	});

	async function setupExternal() {
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
	}

	await test('dev9', async () => {
		await setupExternal();

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		const addPkg = d.findPackage({
			pkgconfig: 'add',
		});

		const test = d.addExecutable({
			name: 'test',
			src: ['src/test.c'],
			linkTo: [addPkg],
		});

		await report(
			[
				'e2e.dev.findPackage.searches-pkgconfig-by-name',
				'e2e.dev.findPackage.can-link-to-exe',
			],
			() => expectOutput(test.binary, '2+2=4'),
		);
	});

	await test('dev10', async () => {
		await setupExternal();

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

		await report('e2e.dev.findPackage.can-specify-version', () =>
			expectOutput(test.binary, '2+2=4'),
		);
	});

	await test('dev11', async () => {
		await setupExternal();

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

		await report('e2e.dev.findPackage.fails-incompatible-version', () => {
			expect(result).to.be.false;
		});
	});

	await test('dev12', async () => {
		await setupExternal();

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

		await report(
			['e2e.dev.findPackage.can-specify-explicit-pkgconfig-name'],
			() => expectOutput(test.binary, '2+2=4'),
		);
	});

	// can find an external package for linking to a library
	await test('dev13', async () => {
		await setupExternal();

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

		await report('e2e.dev.findPackage.can-link-to-lib', () =>
			expectOutput(test.binary, '2*3=6'),
		);
	});

	await test('dev14', async () => {
		await setupExternal();

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
				libraryTarget: 'add',
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

		await report('e2e.dist.findPackage.can-specify-version', () => {
			expect(l, 'Did not find match').not.to.be.empty;
		});
	});

	await test('dev15', async () => {
		await mkdir(join(testDir, 'a', 'include'), { recursive: true });
		await mkdir(join(testDir, 'b', 'include'), { recursive: true });

		await writePath('a/include/a.h', 'char a();');
		await writePath('a/a.c', "char a() { return 'a'; }");
		await writePath('b/include/b.h', 'char b();');
		await writePath('b/b.c', '#include <a.h>', "char b() { return 'a' + 1; }");

		await writePath(
			'src/main.c',
			'#include <stdio.h>',
			'#include <b.h>',
			'int main() {',
			' printf("%c", b());',
			' return 0;',
			'}',
		);

		const a = new Distribution(make, {
			name: 'a',
			version: '1.2.3',
		});

		const liba = a.addLibrary({
			name: 'a',
			src: ['a/a.c'],
			includeDirs: ['a/include'],
		});

		const b = new Distribution(make, {
			name: 'b',
			version: '2.3.4',
		});

		const libb = b.addLibrary({
			name: 'b',
			src: ['b/b.c'],
			includeDirs: ['b/include'],
			linkTo: [liba],
		});

		const d = new Distribution(make, {
			name: 'test',
			version: '3.4.5',
		});

		const main = d.addExecutable({
			name: 'main',
			src: ['src/main.c'],
			linkTo: [libb],
		});

		await report(
			[
				'e2e.dev.addLibrary.can-link-to-other-distribution',
				'e2e.dev.addExecutable.can-link-to-other-distribution',
			],
			() => expectOutput(main.binary, 'b'),
		);
	});

	await test('dev16', async () => {
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

		const { run, binary } = d.addTest({
			name: 'add_test',
			src: ['test/add_test.c'],
			linkTo: [add],
		});

		await report('e2e.dev.addTest.returns-obj-with-run', async () => {
			await updateTarget(make, run);
		});

		await report('e2e.dev.addTest.returns-obj-with-binary', () =>
			expectOutput(binary, ''),
		);

		// also make sure test-add rule works
		await rm(buildDir, { recursive: true });

		await report('e2e.dev.Distribution.test-target', async () => {
			expect(d.test.rel()).to.equal('test-add');
			await updateTarget(make, 'test-add');
		});
	});

	async function setupStaticDynamic() {
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
	}

	await test('dev18', async () => {
		await setupStaticDynamic();

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

		await report('e2e.dev.addLibrary.type-static-implicit-default', () =>
			expectOutput(test.binary, make.abs(test.binary)),
		);
	});

	await test('dev19', async () => {
		await setupStaticDynamic();

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

		await report('e2e.dev.addLibrary.type-static-explicit-default', () =>
			expectOutput(test.binary, make.abs(test.binary)),
		);
	});

	await test('dev20', async () => {
		await setupStaticDynamic();

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

		await report('e2e.dev.addLibrary.type-explicit-static', () =>
			expectOutput(test.binary, make.abs(test.binary)),
		);
	});

	await test('dev21', async () => {
		await setupStaticDynamic();

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

		await report('e2e.dev.addLibrary.type-explicit-dynamic', () =>
			expectOutput(test.binary, make.abs(img.binary)),
		);
	});

	await test('dev22', async () => {
		await setupStaticDynamic();

		await writePath(
			'esmakefile-cmake.config.json',
			JSON.stringify({
				buildSharedLibs: true,
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

		await report(
			'e2e.dev.addLibrary.type-config-dynamic-implicit-default',
			() => expectOutput(test.binary, make.abs(img.binary)),
		);
	});

	await test('dev23', async () => {
		await setupStaticDynamic();

		await writePath(
			'esmakefile-cmake.config.json',
			JSON.stringify({
				buildSharedLibs: true,
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

		await report(
			'e2e.dev.addLibrary.type-config-dynamic-explicit-default',
			() => expectOutput(test.binary, make.abs(img.binary)),
		);
	});

	// generates a compile_commands.json file
	await test('dev24', async () => {
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

		await report('e2e.dev.addCompileCommands.generates-json-db', async () => {
			const clangCheck = process.env['CLANG_CHECK'];
			expect(
				clangCheck,
				'the CLANG_CHECK environment variable should be specified, but is not',
			).not.to.be.empty;
			await run(clangCheck, [
				'-p',
				make.buildRoot,
				make.abs(add),
				make.abs(test),
			]);
		});
	});

	await test('dev25', async () => {
		const fromCflags = join(srcDir, 'from-cflags');
		await mkdir(fromCflags);

		await writePath(
			'esmakefile-cmake.config.json',
			JSON.stringify({
				cflags: [`-I${fromCflags}`],
			}),
		);

		await writePath('src/from-cflags/zero.h', '#define CFLAGS_ZERO 0');
		await writePath(
			'src/cflags.c',
			'#include "zero.h"',
			'int main() { return CFLAGS_ZERO; }',
		);

		const d = new Distribution(make, {
			name: 'test',
			version: '1.2.3',
		});

		const cflags = d.addExecutable({
			name: 'test',
			src: ['src/cflags.c'],
		});

		await report('e2e.dev.config.cflags', () =>
			expectOutput(cflags.binary, ''),
		);
	});
})();

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
