import { Path } from 'esmakefile';

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
