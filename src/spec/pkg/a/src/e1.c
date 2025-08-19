#include <stdio.h>

extern int gen12();

int main() {
	/*
	 * Assuming this will be run from vendor/bin after installing, this
	 * proves that the exe is installed correctly
	 */
	printf("e2e.addExecutable.install-to-bin = 1\n");

	/*
	 * This comes from a generated file. Assuming run from install, this
	 * validates that the generated file was packaged correctly.
	 */
	printf("e2e.addExecutable.packages-generated-src = %d\n", gen12() == 12);

	/*
	 * zero was referenced with findPackage('zero')
	 */
	printf("e2e.addExecutable.findPackage-pc-cmake-same-install = %d\n", ZERO == 0);

	return 0;
}
