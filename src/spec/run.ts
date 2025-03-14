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

import { spawnSync, SpawnSyncOptions } from 'node:child_process';

export async function run(cmd: string): Promise<void>;
export async function run(cmd: string, args: string[]): Promise<void>;
export async function run(cmd: string, opts: SpawnSyncOptions): Promise<void>;
export async function run(
	cmd: string,
	args: string[],
	opts: SpawnSyncOptions,
): Promise<void>;
export async function run(
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
