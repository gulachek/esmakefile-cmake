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
export function parsePrereqs(contents: string): string[] {
	// https://www.gnu.org/software/make/manual/make.html#Splitting-Lines
	const escaped = contents.replace(/\s+\\\n\s+/g, ' ');

	// https://www.gnu.org/software/make/manual/make.html#Rule-Syntax
	const tokens = escaped.split(/\s+/).map((s) => s.trim());

	const prereqs = [];
	let parsingPrereqs = false;
	for (const token of tokens) {
		if (parsingPrereqs) {
			if (token) prereqs.push(token);
		} else {
			if (token.endsWith(':')) parsingPrereqs = true;
		}
	}

	return prereqs;
}
