#ifndef TWO_H
#define TWO_H

#ifdef _WIN32
#define TWO_EXPORT __declspec(dllexport)
#else
#define TWO_EXPORT
#endif

TWO_EXPORT int two();

#endif
