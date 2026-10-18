# Portable reference evidence

`root-pe-resources.json` is sanitized REA metadata from a static PE resource inventory on 2026-10-19. Local account/install paths were replaced by `<ROOT_INSTALL>`. It contains hashes, resource identities, ranges, and parser limits, with no executable bytes, decompiled source, icons, credentials, user data, or network capture. The REA evidence ID identifies the original session record; sanitization changes the exported JSON representation, not the recorded executable SHA-256. This file is an analyst-sanitized derivative, not an unmodified REA export.

To reproduce on an authorized local installation:

1. Inventory only the immediate `current` directory with PowerShell `Get-ChildItem -LiteralPath '<ROOT_INSTALL>/current' | Select-Object Name,Length,Mode`. Do not recursively inspect user profiles or excluded feature directories.
2. Read executable version metadata: `(Get-Item -LiteralPath '<ROOT_INSTALL>/current/Root.exe').VersionInfo | Select-Object ProductName,ProductVersion,FileVersion,CompanyName`.
3. Call REA `inspect_pe_resources` with `path` set to that executable, `max_file_bytes: 400000000`, and default entry budget. This reads the file; it does not launch it or require a decompiler.
4. Compare SHA-256 with the report before reusing conclusions. A changed build needs new evidence.

The inventory's resource coverage is complete within that parser profile. It does not cover executable code, DM state/transport, runtime module use, real window behavior, or network behavior. No native engine setup or application execution was attempted. Do not interpret the unknowns as absence of features.
