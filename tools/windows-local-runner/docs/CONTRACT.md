# Contract WIN-RUNNER-OPS.v2

Exit `0`: verify succeeded, a stop file was recorded, or the task status is `SUCCEEDED`. This is not a Windows or training approval.

Exit `2`: a worker was started and the retained process ended `FAILED`, `TIMED_OUT`, `STOPPED`, or `CLEANUP_PENDING`. The worker's own code is `actual_process_exit` in `result.json`. `failure` keeps worker exit `7` and runner exit `2`.

Exit `3`: refused before a successful new run, or the controller hit an exception after consuming a reservation. There is no automatic retry.

The duplicate key is one ledger file plus `campaign` plus `task`. `run_id` is also unique inside that same file. Another campaign, another `--store`, or another install directory is a different namespace. It is not a global lock and it is not an authorization.

States `RESERVED` and `RUNNING` stay occupied if the controller stops. Terminal rows are not reopened. A wrong existing ledger is rejected without `DROP`, `ALTER`, deletion, or a second create.

`result.json` field `tree_closed` is `NOT_PROVEN`. The deadline covers only the active-child poll loop. SQLite lock wait, process start, and `fsync` are not a hard whole-script deadline. Cleanup waits up to the configured observation and then records `CLEANUP_PENDING` if the retained child has not exited. It does not scan a process tree and it does not create a Windows Job.
