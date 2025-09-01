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
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { chdir, cwd } from 'node:process';
import { run } from './run.js';

const testDir = resolve('.test');
const srcDir = join(testDir, 'src');
const buildDir = join(testDir, 'build');
const includeDir = join(testDir, 'include');
const vendorDir = join(testDir, 'vendor');
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

	const allNames = new Set<string>();

	function test(name: string, impl: () => Promise<void>) {
		if (allNames.has(name)) {
			throw new Error(`Duplicate name '${name}' passed to test(...)`);
		}
		allNames.add(name);

		it(name, async () => {
			make = new Makefile({
				srcRoot: testDir,
				buildRoot: buildDir,
			});

			await mkdir(includeDir, { recursive: true });
			await mkdir(srcDir, { recursive: true });
			const prevDir = cwd();
			chdir(testDir);

			await impl();

			chdir(prevDir);
			await rm(testDir, { recursive: true });
		});
	}

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

	describe('development', () => {
		// builds a single file executable
		test('single-file-exe', async () => {
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

		// updates when source updates
		test('src-is-prereq', async () => {
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

		// can compile multiple source file exe
		test('multi-src-exe', async () => {
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

		// links mixed c/c++ as a c++ executable
		test('mixed-lang-exe', async () => {
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

			await expectOutput(hello.binary, 'hello!');
		});

		// links mixed c/c++ as a c++ library
		test('mixed-lang-lib', async () => {
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

			await expectOutput(main.binary, '2');
		});

		// can specify c11
		test('c11-lang', async () => {
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

		// can specify c17
		test('c17-lang', async () => {
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

		// can specify c++17
		test('cxx17-lang', async () => {
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

		// can specify c++20
		test('cxx20-lang', async () => {
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

		// includes the "include" dir by default
		test('default-include', async () => {
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

		// recompiles after updating header
		test('header-is-postreq', async () => {
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

		// compiles and links libraries
		test('links-transitive-lib', async () => {
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

		// carries includes from linked libraries
		test('includes-dependency-header', async () => {
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

		// can find an external package for linking
		test('link-pkgconfig', async () => {
			await setupExternal();

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

		// can specify a pkgconfig version
		test('specify-pkgconfig-version', async () => {
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

			await expectOutput(test.binary, '2+2=4');
		});

		// fails if incompatible version specified
		test('fails-pkgconfig-version-incompatible', async () => {
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
			expect(result).to.be.false;
		});

		// can specify an external package for linking differently between pkgconfig and cmake
		test('cmake-pkgconfig-different-name', async () => {
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

			await expectOutput(test.binary, '2+2=4');
		});

		// can find an external package for linking to a library
		test('link-pkgconfig-lib', async () => {
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

			await expectOutput(test.binary, '2*3=6');
		});

		// can specify a CMake version
		test('cmake-find-package-version', async () => {
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

			expect(l, 'Did not find match').not.to.be.empty;
		});

		// can link between distributions
		test('cross-distribution-link', async () => {
			await mkdir(join(testDir, 'a', 'include'), { recursive: true });
			await mkdir(join(testDir, 'b', 'include'), { recursive: true });

			await writePath('a/include/a.h', 'char a();');
			await writePath('a/a.c', "char a() { return 'a'; }");
			await writePath('b/include/b.h', 'char b();');
			await writePath(
				'b/b.c',
				'#include <a.h>',
				"char b() { return 'a' + 1; }",
			);

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

			await expectOutput(main.binary, 'b');
		});

		// can add a unit test executable
		test('unit-test-run', async () => {
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

		// has access to unit test executable via binary
		test('unit-test-binary', async () => {
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

			const { binary } = d.addTest({
				name: 'add_test',
				src: ['test/add_test.c'],
				linkTo: [add],
			});

			await expectOutput(binary, '');
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

		// is static by default
		test('default-static', async () => {
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

			await expectOutput(test.binary, make.abs(test.binary));
		});

		// is static when explicitly set to default type
		test('explicit-default-static', async () => {
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

			await expectOutput(test.binary, make.abs(test.binary));
		});

		// is static when explicitly set to static
		test('static-static', async () => {
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

			await expectOutput(test.binary, make.abs(test.binary));
		});

		// is dynamic when explicitly set to dynamic
		test('dynamic-dynamic', async () => {
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

			await expectOutput(test.binary, make.abs(img.binary));
		});

		// is dynamic when default is set to dynamic
		test('default-dynamic', async () => {
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

			await expectOutput(test.binary, make.abs(img.binary));
		});

		// is dynamic when default is set to dynamic and library has explicit default type
		test('explicit-default-dynamic', async () => {
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

			await expectOutput(test.binary, make.abs(img.binary));
		});

		// generates a compile_commands.json file
		test('compile-commands', async () => {
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
