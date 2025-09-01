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

import { cli, Path, PathLike, BuildPathLike, RecipeArgs } from 'esmakefile';
import { cmake } from './cmake.js';
import { installUpstream } from './upstream.js';
import { resolve, join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { platform } from 'node:os';
import { spawn } from 'node:child_process';
import * as yaml from 'yaml';

interface TestCase {
	id: string;
	prose: string;
}

function parsePlan(
	obj: unknown,
	path: string[],
	plan: Map<string, TestCase>,
): void {
	if (!(obj && typeof obj === 'object')) {
		throw new Error(
			`Error parsing plan.yaml. Value at path '${path}' is not an object.`,
		);
	}

	if ('group' in obj) {
		const group = obj['group'];
		if (typeof group !== 'string') {
			throw new Error(
				`Error parsing plan.yaml. 'group' at path '${path}' is not a string.`,
			);
		}

		const groupPath = [...path, group];

		if (!('plan' in obj)) {
			throw new Error(
				`Error parsing plan.yaml. 'plan' for group '${groupPath.join('.')}' does not exist.`,
			);
		}

		const groupPlan = obj['plan'];
		if (!Array.isArray(groupPlan)) {
			throw new Error(
				`Error parsing plan.yaml. 'plan' for group '${groupPath.join('.')}' is not an Array.`,
			);
		}

		for (const child of groupPlan) {
			parsePlan(child, groupPath, plan);
		}
	} else if ('case' in obj) {
		const testCase = obj['case'];
		if (typeof testCase !== 'string') {
			throw new Error(
				`Error parsing plan.yaml. 'case' at path '${path}' is not a string.`,
			);
		}

		const id = [...path, testCase].join('.');

		if (plan.has(id)) {
			throw new Error(
				`Error parsing plan.yaml. Test case '${id}' has multiple definitions.`,
			);
		}

		if (!('prose' in obj && typeof obj['prose'] === 'string')) {
			throw new Error(
				`Error parsing plan.yaml. 'prose' for case '${id}' is either missing or not a string.`,
			);
		}

		const prose = obj['prose'];

		plan.set(id, { id, prose });
	} else {
		throw new Error(
			`Error parsing plan.yaml. Object at path '${path}' has neither a 'group' nor a 'case' definition.`,
		);
	}
}

const planYaml = readFileSync('src/spec/plan.yaml', 'utf8');
const plan = new Map<string, TestCase>();
parsePlan(yaml.parse(planYaml), [], plan);

if (plan.size < 1) {
	throw new Error('Expected at least 1 case in plan.yaml, but found zero.');
}

const nodeExe = process.execPath;

const upstreamVendorDir = resolve('vendor');
const upstreamVendorBuildDir = join(upstreamVendorDir, 'build');
const pkgVendorDir = Path.build('vendor');
const pkgPackDir = Path.build('pkg/pack');
const pkgUnpackDir = Path.build('pkg/unpack');
const pkgBuildDir = Path.build('pkg/build');
const downstreamSrc = Path.src('src/spec/downstream');
const downstreamDist = Path.src('dist/spec/downstream');
const downstreamEsmakeDir = Path.build('downstream/esmake');
//const downstreamCmakeDir = Path.build('downstream/cmake');

function exe(path: string): string {
	return platform() === 'win32' ? path + '.exe' : path;
}

interface TestResult {
	id: string;
	passed: boolean;
}

function spawnAsync(exe: string, args?: string[]): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		args = args || [];
		const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });

		const outChunks: Buffer[] = [];
		const errChunks: Buffer[] = [];

		child.stdout.on('data', (chunk) => outChunks.push(Buffer.from(chunk)));
		child.stderr.on('data', (chunk) => errChunks.push(Buffer.from(chunk)));

		child.on('error', reject);

		child.on('close', (code, signal) => {
			const stdout = Buffer.concat(outChunks).toString('utf8');
			const stderr = Buffer.concat(errChunks).toString('utf8');

			if (code === 0 && signal == null) {
				resolve(stdout);
			} else {
				const err = new Error(
					`Command failed: ${exe} ${args.join(' ')} (code ${code}${
						signal ? `, signal ${signal}` : ''
					})\n${stderr}`,
				);
				reject(err);
			}
		});
	});
}

async function runTestExe(exe: string): Promise<TestResult[]> {
	const results: TestResult[] = [];

	const stdout = await spawnAsync(exe);
	const lines = stdout.split(/\r?\n/);
	for (let line of lines) {
		line = line.trim();
		if (!line) {
			continue;
		}

		const eqIndex = line.indexOf('=');
		if (eqIndex === -1) {
			throw new Error(
				`Invalid output from exe '${exe}'. Line had no '=': ${line}`,
			);
		}

		const id = line.substring(0, eqIndex).trim();

		const result = line.substring(eqIndex + 1).trim();
		if (result === '1') {
			results.push({ id, passed: true });
		} else if (result === '0') {
			results.push({ id, passed: false });
		} else {
			throw new Error(
				`Invalid output from exe '${exe}'. Line neither indicated '0' nor '1': ${line}`,
			);
		}
	}

	return results;
}

interface IRunEsmakefileOpts {
	makeJs: PathLike;
	outDir: BuildPathLike;
	srcDir: PathLike;
	target: string;
}

function runEsmake(
	args: RecipeArgs,
	opts: IRunEsmakefileOpts,
): Promise<boolean> {
	const makeJs = Path.src(opts.makeJs);
	const outDir = Path.build(opts.outDir);
	const srcDir = Path.src(opts.srcDir);

	const proc = spawn(
		nodeExe,
		[
			args.abs(makeJs),
			'--outdir',
			args.abs(outDir),
			'--srcdir',
			args.abs(srcDir),
			opts.target,
		],
		{ stdio: 'pipe', cwd: '.test' },
	);

	proc.stdout.pipe(args.logStream, { end: false });
	proc.stderr.pipe(args.logStream, { end: false });

	return new Promise<boolean>((res) => {
		proc.on('close', (code) => {
			res(code === 0);
		});
	});
}

cli((make) => {
	let allResults: TestResult[] = [];

	const esmakefileCmakeConfig = Path.build('esmakefile-cmake.config.json');

	const aTarball = pkgPackDir.join('a/a-0.1.0.tgz');
	const aCmake = pkgUnpackDir.join('a/CMakeLists.txt');

	make.add('test', ['dev', 'pkg']);

	make.add('install-upstream', (_) => {
		return installUpstream(upstreamVendorBuildDir, upstreamVendorDir);
	});

	make.add('reset', () => {
		allResults = [];
	});

	make.add('distribution-spec', ['install-upstream'], (args) => {
		const mochaJs = 'node_modules/mocha/bin/mocha.js';
		return args.spawn(nodeExe, [mochaJs, 'dist/spec/DistributionSpec.js']);
	});

	make.add('dev', ['distribution-spec'], () => {});

	// TODO: make this independent from distribution-spec by not deleting .test dir over and over again in that spec
	make.add(esmakefileCmakeConfig, ['distribution-spec'], (args) => {
		return writeFile(
			args.abs(esmakefileCmakeConfig),
			JSON.stringify({
				addPkgConfigSearchPaths: [join(upstreamVendorDir, 'lib', 'pkgconfig')],
			}),
		);
	});

	make.add(aTarball, [esmakefileCmakeConfig], (args) => {
		return runEsmake(args, {
			makeJs: 'dist/spec/pkg/a/make.js',
			srcDir: 'src/spec/pkg/a',
			outDir: aTarball.dir(),
			target: aTarball.basename,
		});
	});

	make.add(aCmake, [aTarball, 'reset'], async (args) => {
		const aPkg = aCmake.dir();

		const result = await args.spawn('tar', [
			'xzf',
			args.abs(aTarball),
			'-C',
			args.abs(aPkg),
			'--strip-components=1',
		]);
		if (!result) {
			return false;
		}

		const list = await spawnAsync('tar', ['tzf', args.abs(aTarball)]);
		const t1Index = list.indexOf('t1.c');
		allResults.push({
			id: 'e2e.addTest.omitted-from-package',
			passed: t1Index === -1,
		});

		const licenseTxt = await readFile(
			args.abs(aPkg.join('LICENSE.txt')),
			'utf8',
		);
		allResults.push({
			id: 'e2e.Distribution.package-copies-license',
			passed: licenseTxt.indexOf("Fake license for 'a'") >= 0,
		});

		const e1Src = await readFile(args.abs(aPkg.join('src/e1.c')), 'utf8');
		allResults.push({
			id: 'e2e.Distribution.package-copies-exe-static-src',
			passed: !!e1Src,
		});

		const genSrc = await readFile(args.abs(aPkg.join('src/gen.c')), 'utf8');
		allResults.push({
			id: 'e2e.Distribution.package-copies-exe-generated-src',
			passed: !!genSrc,
		});

		return true;
	});

	make.add('package-install', [aCmake], async (args) => {
		const pkgBuild = args.abs(pkgBuildDir);

		const cmakeTxt = pkgUnpackDir.join('CMakeLists.txt');
		await writeFile(
			args.abs(cmakeTxt),
			[
				'cmake_minimum_required(VERSION 3.10)',
				'project(E2E)',
				'add_subdirectory(a)',
			].join('\n'),
		);

		await cmake.configure({
			src: args.abs(cmakeTxt.dir()),
			build: pkgBuild,
			prefixPath: [args.abs(pkgVendorDir), upstreamVendorDir],
		});

		await cmake.build(pkgBuild, { config: 'Release' });
		await cmake.install(pkgBuild, { prefix: args.abs(pkgVendorDir) });
	});

	make.add('run-e1', ['package-install', 'reset'], async (args) => {
		const results = await runTestExe(
			args.abs(Path.build(exe('vendor/bin/e1'))),
		);
		allResults.push(...results);
	});

	const d1Esmake = downstreamEsmakeDir.join(exe('d1/d1/d1'));

	make.add(d1Esmake, ['install-upstream', 'package-install'], async (args) => {
		const success = await runEsmake(args, {
			makeJs: downstreamDist.join('d1/make.js'),
			srcDir: downstreamSrc.join('d1'),
			outDir: d1Esmake.dir().dir(),
			target: exe('d1/d1'),
		});

		if (!success) return false;

		return args.spawn(args.abs(d1Esmake), []);
	});

	make.add('pkg', [d1Esmake, 'run-e1'], (args) => {
		let allPassed = true;
		const missedCases = new Set<string>();
		for (const [id, _] of plan) {
			missedCases.add(id);
		}

		for (const r of allResults) {
			const { id, passed } = r;
			missedCases.delete(id);

			if (!passed) {
				allPassed = false;
			}

			if (!plan.has(id)) {
				allPassed = false;
				args.logStream.write(`Unplanned test case in results: ${id}\n`);
			}

			args.logStream.write(`${id} = ${passed ? 'pass' : 'fail'}\n`);
		}

		if (missedCases.size > 0) {
			allPassed = false;
			args.logStream.write(
				`Planned test cases had no results: ${Array.from(missedCases).join(', ')}\n`,
			);
		}

		return allPassed;
	});
});
