from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=10, max_length=200)


class UserView(BaseModel):
    id: int
    username: str
    display_name: str
    is_admin: bool
