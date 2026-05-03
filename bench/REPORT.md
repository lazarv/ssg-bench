# SSG benchmark report

_Generated: 2026-05-02T21:44:34.960Z_

Read **35** records from **7** result files across **7** page count(s) × **5** framework(s). Each cell shows the **fastest successful run** — every value in the row comes from that single build, no averaging.

Columns:

- **wall** — total build time, spawn-to-exit
- **ttfp** — time from build start to first `*.html` written
- **peak RSS** — peak resident memory across the build process tree
- **html** — count of HTML files in the deployable output dir
- **bytes** — total bytes of the deployable output dir
- **pages/s** — `html / wall`
- **status** — `ok` (validated), `warn` (build exited non-zero but pages render), `ERR` (sampled HTML missing/wrong)

## PAGE_COUNT = 1,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 1.65s | 1.36s | 1.16 GiB | 1,000 | 826.9 KiB | 606 | ok |
| Next.js | 3.89s | 2.87s | 1.42 GiB | 1,004 | 19.3 MiB | 258 | ok |
| TanStack Start | 2.11s | 1.60s | 602.4 MiB | 1,000 | 2.0 MiB | 474 | ok |
| Gatsby | 11.39s | 5.21s | 4.05 GiB | 1,002 | 3.5 MiB | 88 | ok |
| Astro | 1.97s | 1.74s | 597.3 MiB | 1,001 | 454.0 KiB | 508 | ok |

## PAGE_COUNT = 10,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 4.62s | 1.37s | 2.21 GiB | 10,000 | 8.2 MiB | 2,164 | ok |
| Next.js | 20.82s | 12.18s | 1.95 GiB | 10,004 | 187.9 MiB | 480 | ok |
| TanStack Start | 5.39s | 1.86s | 926.0 MiB | 10,000 | 17.3 MiB | 1,855 | ok |
| Gatsby | 16.07s | 5.99s | 4.40 GiB | 10,002 | 20.2 MiB | 623 | ok |
| Astro | 4.14s | 1.90s | 638.7 MiB | 10,001 | 4.6 MiB | 2,417 | ok |

## PAGE_COUNT = 100,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 26.12s | 1.63s | 2.46 GiB | 100,000 | 83.1 MiB | 3,829 | ok |
| Next.js | 264.50s | 124.00s | 4.33 GiB | 100,004 | 1.84 GiB | 378 | ok |
| TanStack Start | 36.96s | 2.65s | 1.62 GiB | 100,000 | 171.9 MiB | 2,706 | ok |
| Gatsby | 62.10s | 7.91s | 5.89 GiB | 100,002 | 188.6 MiB | 1,610 | ok |
| Astro | 22.63s | 2.18s | 926.8 MiB | 100,001 | 46.8 MiB | 4,419 | ok |

## PAGE_COUNT = 200,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 57.99s | 2.12s | 2.48 GiB | 200,000 | 167.4 MiB | 3,449 | ok |
| Next.js | 3.65s | — | 1003.8 MiB | 0 | 0 B | 0 | ERR |
| TanStack Start | 86.43s | 4.11s | 2.42 GiB | 200,000 | 344.7 MiB | 2,314 | ok |
| Gatsby | 127.25s | 62.83s | 6.47 GiB | 200,002 | 377.0 MiB | 1,572 | ok |
| Astro | 55.35s | 2.95s | 1.18 GiB | 200,001 | 95.0 MiB | 3,613 | ok |

## PAGE_COUNT = 300,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 98.82s | 2.35s | 2.54 GiB | 300,000 | 251.7 MiB | 3,036 | ok |
| Next.js | 2.43s | — | 650.2 MiB | 0 | 0 B | 0 | ERR |
| TanStack Start | 139.90s | 4.38s | 2.88 GiB | 300,000 | 517.5 MiB | 2,144 | ok |
| Gatsby | 194.60s | 92.48s | 7.12 GiB | 300,002 | 565.5 MiB | 1,542 | ok |
| Astro | 97.30s | 2.88s | 1.48 GiB | 300,001 | 143.2 MiB | 3,083 | ok |

## PAGE_COUNT = 400,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 126.59s | 3.18s | 2.59 GiB | 400,000 | 336.1 MiB | 3,160 | ok |
| Next.js | 2.43s | — | 649.7 MiB | 0 | 0 B | 0 | ERR |
| TanStack Start | 203.18s | 8.92s | 3.58 GiB | 400,000 | 690.4 MiB | 1,969 | ok |
| Gatsby | 235.51s | 101.45s | 9.34 GiB | 400,002 | 754.0 MiB | 1,698 | ok |
| Astro | 116.39s | 3.88s | 1.66 GiB | 400,001 | 191.4 MiB | 3,437 | ok |

## PAGE_COUNT = 500,000

| Framework | wall | ttfp | peak RSS | html | bytes | pages/s | status |
| :-- | --: | --: | --: | --: | --: | --: | :-- |
| react-server | 155.17s | 2.87s | 2.58 GiB | 500,000 | 420.4 MiB | 3,222 | ok |
| Next.js | 2.44s | — | 667.9 MiB | 0 | 0 B | 0 | ERR |
| TanStack Start | 264.53s | 6.92s | 3.12 GiB | 500,000 | 863.2 MiB | 1,890 | ok |
| Gatsby | 297.85s | 21.14s | 9.55 GiB | 500,002 | 942.5 MiB | 1,679 | ok |
| Astro | 149.27s | 3.62s | 1.81 GiB | 500,001 | 239.6 MiB | 3,350 | ok |

## Cells with warnings / errors

- **Next.js @ PAGE_COUNT=200,000** — ERR · next id=1: no output found at posts/1/index.html
- **Next.js @ PAGE_COUNT=300,000** — ERR · next id=1: no output found at posts/1/index.html
- **Next.js @ PAGE_COUNT=400,000** — ERR · next id=1: no output found at posts/1/index.html
- **Next.js @ PAGE_COUNT=500,000** — ERR · next id=1: no output found at posts/1/index.html

