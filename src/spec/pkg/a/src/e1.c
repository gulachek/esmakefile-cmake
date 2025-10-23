#include <hello.h>
#include <one.h>
#include <two.h>

#include <stdio.h>
#include <string.h>

#include "secret.h"
#ifdef SECRET
#define SECRET_FOUND 1
#else
#define SECRET_FOUND 0
#endif

extern int gen12();

int main() {
  /*
   * Assuming this will be run from vendor/bin after installing, this
   * proves that the exe is installed correctly
   */
  printf("tst.dist.exe-install-to-bin = 1\n");

  /*
   * This comes from a generated file. Assuming run from install, this
   * validates that the generated file was packaged correctly.
   */
  printf("tst.dist.packages-generated-src = %d\n", gen12() == 12);

  printf("tst.dist.includes.exe-includes-private = %d\n", SECRET_FOUND);
  printf("tst.dist.includes.copies-private = %d\n", SECRET_FOUND);

  /*
   * zero was referenced with findPackage('zero')
   */
  printf("tst.dist.findPackage-implicit-cmake-name = %d\n", ZERO == 0);

  /*
   * one was referenced with findPackage({ cmake: 'one', ... })
   */
  printf("tst.dist.findPackage-explicit-cmake-name = %d\n", one() == 1);

  /*
   * two was referenced with findPackage with { cmake: { name: ...,
   * libraryTarget: ... } }
   */
  printf("tst.dist.findPackage-explicit-cmake-target = %d\n", two() == 2);

  /*
   * hello was referenced with findPackage with { cmake: { ..., component: ... }
   * }
   */
  printf("tst.dist.findPackage-explicit-cmake-component = %d\n",
         strcmp(hello(), "hello") == 0);
  return 0;
}
