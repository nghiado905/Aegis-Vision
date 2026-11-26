from enum import IntEnum


class WorkspaceRole(IntEnum):
    viewer = 10
    editor = 20
    manager = 30
    owner = 40


def allows(actual: str, required: str) -> bool:
    return WorkspaceRole[actual] >= WorkspaceRole[required]
