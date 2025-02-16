import { Path } from 'esmakefile';

export type CStandard = 90 | 99 | 11 | 17 | 23;
export type CxxStandard = 98 | 11 | 14 | 17 | 20 | 23 | 26;

// TODO - unit test the crap out of this. File extensions
export function isCxxSrc(src: Path): boolean {
	return src.extname !== '.c';
}

export function isCxxLink(srcs: Path[]): boolean {
	for (const s of srcs) {
		if (isCxxSrc(s)) return true;
	}

	return false;
}
