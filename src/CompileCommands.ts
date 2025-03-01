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
import { Makefile, Path, IBuildPath } from 'esmakefile';
import { Distribution } from './Distribution.js';
import { readFile, writeFile } from 'node:fs/promises';

// https://clang.llvm.org/docs/JSONCompilationDatabase.html
export interface ICompileCommand {
	// file being compiled
	file: string;

	// working directory of command
	directory: string;

	// argv[0] has command. Should be clang[++] or clang-cl
	arguments: string[];
}

/** Index from command's file (assume abs path) to its command */
export type CompileCommandIndex = Map<string, ICompileCommand>;

export async function parseCompileCommands(
	jsonAbs: string,
): Promise<CompileCommandIndex> {
	// in case error happens
	const errPrefix = `File '${jsonAbs}' is not a valid compilation database`;

	const json = await readFile(jsonAbs, 'utf8');
	const obj = JSON.parse(json);
	if (!Array.isArray(obj)) {
		throw new Error(`${errPrefix}: Not a top level array`);
	}

	const out = new Map<string, ICompileCommand>();

	for (const elem of obj) {
		if (!isCompileCommand(elem)) {
			throw new Error(
				`${errPrefix}: Element is not in the format expected by esmakefile-cmake: ${JSON.stringify(elem)}`,
			);
		}

		out.set(elem.file, elem);
	}

	return out;
}

export async function dumpCompileCommands(
	jsonAbs: string,
	index: CompileCommandIndex,
): Promise<void> {
	const cmds = Array.from(index.values());
	await writeFile(jsonAbs, JSON.stringify(cmds), 'utf8');
}

export function addCompileCommands(
	make: Makefile,
	...dists: Distribution[]
): IBuildPath {
	const cmds = Path.build('compile_commands.json');
	const allCmds: IBuildPath[] = [];

	for (const d of dists) {
		if (d.make !== make)
			throw new Error(
				`Distribution ${d.name}/${d.version} is not associated with given Makefile`,
			);

		allCmds.push(...d.compileCommandsComponents());
	}

	make.add(cmds, allCmds, async (args) => {
		const elems: ICompileCommand[] = [];
		for (const component of allCmds) {
			try {
				const index = await parseCompileCommands(args.abs(component));
				elems.push(...index.values());
			} catch (ex) {
				args.logStream.write(ex.message);
				return false;
			}
		}

		await writeFile(args.abs(cmds), JSON.stringify(elems), 'utf8');
	});

	return cmds;
}

function isCompileCommand(obj: unknown): obj is ICompileCommand {
	if (!(obj && typeof obj === 'object')) return false;

	const cmd = obj as Partial<ICompileCommand>;
	if (typeof cmd.file !== 'string') return false;
	if (typeof cmd.directory !== 'string') return false;
	if (!Array.isArray(cmd.arguments)) return false;
	for (const arg of cmd.arguments) {
		if (typeof arg !== 'string') return false;
	}

	return true;
}
