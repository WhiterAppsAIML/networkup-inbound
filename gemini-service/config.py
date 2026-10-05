from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    GEMINI_API_KEY: str
    SERVICE_TOKEN: str


settings = Settings()