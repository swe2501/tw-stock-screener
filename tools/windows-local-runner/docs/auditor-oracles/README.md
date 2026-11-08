# Auditor reference copies

These files are byte copies of the independent acceptance notes and scripts supplied for this repair. They still point at the auditor's v1 source gate and machine paths.

`independent_known_gaps_v2.py` changes only the launch-PID oracle. Its status file says AST `PASS` and full script execution `NOT_RUN`. This repository did not execute that script. An exit 0 from the v1 reproducer means both defects were seen, which is a product failure, not a fix.

`independent_runner_acceptance_v2.py` is the normal-path matrix against frozen v1 hashes. It stops when those hashes change, so it is not a v2 acceptance run. The v2 regression is `tests/test_linux_fixture.py`. Independent acceptance remains the auditor's.
