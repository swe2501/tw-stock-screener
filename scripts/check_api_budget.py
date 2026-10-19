"""Count deployed Python entrypoints from this repo's legacy Vercel builds.

The 12-function ceiling is a project requirement. Aliases and SQL RPCs are not
additional Vercel functions. Fail closed if the deployment model changes.
"""
import argparse
import json
from pathlib import Path

API_LIMIT = 12
ROOT = Path(__file__).resolve().parents[1]


def entrypoints(root=ROOT):
    root = Path(root).resolve()
    config = json.loads((root / "vercel.json").read_text(encoding="utf-8"))
    builds = config.get("builds")
    if not isinstance(builds, list) or not builds:
        raise ValueError("部署模式已改變，請更新 API 數量檢查，勿略過檢查。")
    paths = set()
    for build in builds:
        if build.get("use") == "@vercel/static":
            continue
        if build.get("use") != "@vercel/python":
            raise ValueError("發現其他 Function runtime，請先更新數量檢查。")
        pattern = build.get("src")
        if not isinstance(pattern, str) or pattern.startswith("/") or ".." in Path(pattern).parts:
            raise ValueError("不支援的 Function 路徑，請先檢查部署設定。")
        matched = [path for path in root.glob(pattern) if path.is_file()]
        if not matched:
            raise ValueError("Function build 沒有符合的檔案：" + pattern)
        for path in matched:
            if path.suffix != ".py" or not path.resolve().is_relative_to(root):
                raise ValueError("非預期的 Python Function 入口：" + str(path))
            paths.add(path.relative_to(root).as_posix())
    return sorted(paths)


def check(root=ROOT):
    paths = entrypoints(root)
    if len(paths) > API_LIMIT:
        raise ValueError(f"API 入口 {len(paths)}/{API_LIMIT}：超過上限，請先合併再部署。")
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        paths = check(args.root)
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + "\n")
    print(f"PASS: deployed API entrypoints {len(paths)}/{API_LIMIT}")
    for path in paths:
        print("  " + path)


if __name__ == "__main__":
    main()
