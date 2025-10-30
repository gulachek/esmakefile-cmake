#include <a/a.h>
#include <mkuuid/mkuuid.h>
#include <stdio.h>

int main() {
  char tmp[37];
  mkuuid(tmp, 37);

  return a() == 'a' ? 0 : 1;
}
