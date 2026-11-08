# Repository suitability

`tw-stock-screener` is a website repository. It is a suitable Git cabinet for this isolated tool under `tools/windows-local-runner/` because that path is not a Vercel function or a served site page. `vercel.json` already excludes `tools/**` from the Python function bundle, and no site route serves this directory.

It is not the trainer project. `C:\Users\User\Desktop\AI型態判斷` has no `.git` in the report given to this work, and nothing here binds that directory to this repository. `D:\StockAI\runner\run_train.ps1` was an illustration, not a file this tool reads or writes.

No website page, API, auth rule, database schema, or deployment setting is changed by this tool. Adding the tool does not deploy it.
