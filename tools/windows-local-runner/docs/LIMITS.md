# Limits that this runner does not claim

- Windows Python `3.14.5`, PowerShell `5.1.19041.6456`, Git `2.46.1`, and host `O211102` are gates for a future Windows install. They were not executed in the Linux fixture.
- Linux directory mode `0700` and file mode `0600` are read back on Linux. That is not a Windows ACL. On Windows the installer must set a protected DACL and read it back, or stop. Failure leaves the partial directory in place.
- The external release index is authority only when the operator obtained it outside the files being executed and compared it to the published commit. `source_pin.json` beside the runner cannot authenticate itself.
- Hash equality does not survive an attacker who can rewrite the runner, the pin, and the index together. It detects mismatched bytes and the two recorded defects below.
- R01: v1 used `CREATE TABLE IF NOT EXISTS`, so a pre-existing table with the same columns and no primary key accepted two runs. v2 reads the existing schema in read-only immutable mode and refuses it. The file bytes, SQL, and rows stay as they were.
- R02: v1 hashed the first config read and then parsed a later `read_text`. v2 parses the config dict and the pin identity from the same byte objects that passed the hash. It does not rewrite the pin to match a file that changed after that read. A later write to the path is outside that snapshot; this is not a continuous file watch.
- Namespace is `install directory + store name + campaign + task`. A second store is intentionally not a duplicate.
- Transport or runner success is not dataset quality and not training readiness. `pipeline_go` stays false.
- No CopyFromBox or `Copy-Item` no-clobber behavior is used. The inbox is created with `mkdir` that fails if the name exists, and files are created with `O_CREAT|O_EXCL`. An existing directory, file, or dangling symlink is left alone.
- The inbox parent must already exist. This installer does not create parent folders and does not pick a replacement directory after an error.
- Controller crash, power loss, and grandchild processes are not proven clean. The kill fixture records whatever `/proc` shows and still reports the tree as not proven.
