#if defined(_WIN32)
#include <rpc.h>
#elif defined(__APPLE__)
#include <CoreFoundation/CoreFoundation.h>
#elif defined(__linux__)
#include <uuid/uuid.h>
#else
#error "Platform not supported"
#endif

#include <stdio.h>
#include <string.h>

#define UUID_SIZE 37 // 36 + null

int mkuuid(char *buf, size_t bufsz) {
  if (!buf || bufsz < UUID_SIZE) {
    return -1;
  }

#if defined(_WIN32)
  UUID uuid;
  if (UuidCreate(&uuid) != RPC_S_OK)
    return -1;

  RPC_CSTR tmp = NULL;
  if (UuidToStringA(&uuid, &tmp) != RPC_S_OK)
    return -1;

  strncpy(buf, (const char *)tmp, bufsz - 1);
  buf[bufsz - 1] = '\0';
  return 0;
#elif defined(__APPLE__)
  CFUUIDRef uuid = CFUUIDCreate(NULL);
  if (!uuid)
    return -1;

  CFStringRef str = CFUUIDCreateString(NULL, uuid);
  CFRelease(uuid);
  if (!str)
    return -1;

  Boolean ok = CFStringGetCString(str, buf, bufsz, kCFStringEncodingUTF8);
  CFRelease(str);

  return ok ? 0 : -1;
#elif defined(__linux__)
  uuid_t uuid;
  uuid_generate_random(uuid);

  char tmp[UUID_SIZE];
  uuid_unparse_lower(uuid, tmp);

  strncpy(buf, (const char *)tmp, bufsz - 1);
  buf[bufsz - 1] = '\0';
  return 0;
#else
#error "Platform not supported"
#endif
}
