from fastapi import APIRouter


router = APIRouter()


@router.get("")
def list_users_placeholder():
    return {"detail": "User routes are being migrated from server.py"}
