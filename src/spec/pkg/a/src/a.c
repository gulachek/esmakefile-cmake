#include "a/a.h"
#include "secret.h"

#ifndef SECRET
#error "SECRET was not found, indicating that private/include was not included!"
#endif

char a() { return 'a'; }
