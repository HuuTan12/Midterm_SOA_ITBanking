from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "sqlite:///./account_service.db"
    jwt_secret_key: str = "change-this-secret-key-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    internal_api_key: str = "change-this-internal-key"

    class Config:
        env_file = ".env"


settings = Settings()
