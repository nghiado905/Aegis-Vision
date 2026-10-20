"""Compatibility launcher for YOLO Workspace Studio."""

import argparse

from src.backend.app import *  # noqa: F401,F403 - compatibility with the old module


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", default="run", choices=["run", "init-admin"])
    parser.add_argument("--username", default="admin")
    parser.add_argument("--name", default="Administrator")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "init-admin":
        init_admin(args.username.strip().lower(), args.name.strip())
        return

    import uvicorn

    print(f"YOLO Workspace Studio => http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, workers=1, proxy_headers=False)


if __name__ == "__main__":
    main()
