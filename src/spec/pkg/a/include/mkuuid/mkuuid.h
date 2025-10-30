#ifndef MKUUID_H
#define MKUUID_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

int mkuuid(char *buf, size_t bufsz);

#ifdef __cplusplus
}
#endif

#endif
