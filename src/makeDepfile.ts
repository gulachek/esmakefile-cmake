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
