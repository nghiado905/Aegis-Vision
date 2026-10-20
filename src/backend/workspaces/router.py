from fastapi import APIRouter


router = APIRouter()


@router.get("")
def list_workspaces_placeholder():
    return {"detail": "Workspace routes are being migrated from server.py"}
