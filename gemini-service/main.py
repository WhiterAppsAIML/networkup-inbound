import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from config import settings
from gemini_client import (
    MODEL_NAME,
    analyze_action_words,
    generate_connection_note,
    improvise_comment,
    personalize_message,
    score_lead,
)
from schemas import (
    ActionWordsRequest,
    ActionWordsResponse,
    CommentRequest,
    CommentResponse,
    ConnectionNoteRequest,
    ConnectionNoteResponse,
    LeadScoreRequest,
    LeadScoreResponse,
    MessageRequest,
    MessageResponse,
    TokensUsed,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gemini-comment-service")

app = FastAPI(title="gemini-comment-service")

_executor = ThreadPoolExecutor(max_workers=4)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": exc.errors()})


def verify_token(authorization: str = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    expected = settings.SERVICE_TOKEN.strip()
    if token != expected:
        logger.warning(
            "token mismatch: received_len=%s expected_len=%s received_repr=%s expected_repr=%s",
            len(token),
            len(expected),
            repr(token),
            repr(expected),
        )
        raise HTTPException(status_code=401, detail="Invalid service token")


@app.get("/health")
async def health():
    return {"status": "ok"}


COMMENT_IMPROVISE_TIMEOUT_SECONDS = 9 

@app.post("/api/v1/comment/improvise", response_model=CommentResponse)
async def improvise(request: CommentRequest, _=Depends(verify_token)):
    start = time.monotonic()
    try:
        future = _executor.submit(
            improvise_comment,
            request.baseTemplate,
            request.leadContext,
            request.isConnected,
        )
        comment, prompt_tokens, completion_tokens = future.result(timeout=COMMENT_IMPROVISE_TIMEOUT_SECONDS)

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "status=success prompt_tokens=%s completion_tokens=%s latency_ms=%s model=%s",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            MODEL_NAME,
        )

        return CommentResponse(
            improvisedComment=comment,
            tokensUsed=TokensUsed(prompt=prompt_tokens, completion=completion_tokens),
            model=MODEL_NAME,
        )

    except FutureTimeoutError:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("status=timeout latency_ms=%s model=%s", latency_ms, MODEL_NAME)
        raise HTTPException(status_code=500, detail="Gemini request timed out")

    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("status=error latency_ms=%s model=%s error=%s", latency_ms, MODEL_NAME, str(exc))
        raise HTTPException(status_code=500, detail="Internal error generating comment")

MESSAGE_TIMEOUT_SECONDS = 9

@app.post("/api/v1/message/personalize", response_model=MessageResponse)
async def personalize(request: MessageRequest, _=Depends(verify_token)):
    start = time.monotonic()
    try:
        future = _executor.submit(
            personalize_message,
            request.baseTemplate,
            request.leadContext,
            request.postContext,
            request.isConnected,
        )
        message, prompt_tokens, completion_tokens = future.result(timeout=MESSAGE_TIMEOUT_SECONDS)

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "endpoint=message status=success prompt_tokens=%s completion_tokens=%s latency_ms=%s model=%s",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            MODEL_NAME,
        )

        return MessageResponse(
            improvisedMessage=message,
            tokensUsed=TokensUsed(prompt=prompt_tokens, completion=completion_tokens),
            model=MODEL_NAME,
        )

    except FutureTimeoutError:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("endpoint=message status=timeout latency_ms=%s model=%s", latency_ms, MODEL_NAME)
        raise HTTPException(status_code=500, detail="Gemini request timed out")

    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "endpoint=message status=error latency_ms=%s model=%s error=%s", latency_ms, MODEL_NAME, str(exc)
        )
        raise HTTPException(status_code=500, detail="Internal error generating message")


CONNECTION_TIMEOUT_SECONDS = 7


@app.post("/api/v1/connection/note", response_model=ConnectionNoteResponse)
async def connection_note(request: ConnectionNoteRequest, _=Depends(verify_token)):
    start = time.monotonic()
    try:
        future = _executor.submit(
            generate_connection_note,
            request.leadContext,
            request.postContext,
            request.maxChars,
        )
        note, prompt_tokens, completion_tokens = future.result(timeout=CONNECTION_TIMEOUT_SECONDS)

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "endpoint=connection status=success prompt_tokens=%s completion_tokens=%s latency_ms=%s model=%s",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            MODEL_NAME,
        )

        return ConnectionNoteResponse(
            connectionNote=note,
            tokensUsed=TokensUsed(prompt=prompt_tokens, completion=completion_tokens),
            model=MODEL_NAME,
        )

    except FutureTimeoutError:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("endpoint=connection status=timeout latency_ms=%s model=%s", latency_ms, MODEL_NAME)
        raise HTTPException(status_code=500, detail="Gemini request timed out")

    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "endpoint=connection status=error latency_ms=%s model=%s error=%s", latency_ms, MODEL_NAME, str(exc)
        )
        raise HTTPException(status_code=500, detail="Internal error generating connection note")


ACTION_WORDS_TIMEOUT_SECONDS = 4


@app.post("/api/v1/action-words/analyze", response_model=ActionWordsResponse)
async def action_words_analyze(request: ActionWordsRequest, _=Depends(verify_token)):
    start = time.monotonic()
    try:
        future = _executor.submit(
            analyze_action_words,
            request.commentText,
            request.actionWords,
        )
        matched, matched_words, confidence, reason, prompt_tokens, completion_tokens = future.result(
            timeout=ACTION_WORDS_TIMEOUT_SECONDS
        )

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "endpoint=action_words status=success prompt_tokens=%s completion_tokens=%s latency_ms=%s model=%s",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            MODEL_NAME,
        )
    
        return ActionWordsResponse(
            matched=matched,
            matchedWords=matched_words,
            confidence=confidence,
            reason=reason,
        )

    except FutureTimeoutError:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("endpoint=action_words status=timeout latency_ms=%s model=%s", latency_ms, MODEL_NAME)
        raise HTTPException(status_code=500, detail="Gemini request timed out")

    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "endpoint=action_words status=error latency_ms=%s model=%s error=%s",
            latency_ms,
            MODEL_NAME,
            str(exc),
        )
        raise HTTPException(status_code=500, detail="Internal error analyzing action words")


LEAD_SCORE_TIMEOUT_SECONDS = 4


@app.post("/api/v1/lead/score", response_model=LeadScoreResponse)
async def lead_score(request: LeadScoreRequest, _=Depends(verify_token)):
    start = time.monotonic()
    try:
        future = _executor.submit(
            score_lead,
            request.leadContext,
            request.postContext,
            request.profileData,
        )
        score, tier, factors, prompt_tokens, completion_tokens = future.result(
            timeout=LEAD_SCORE_TIMEOUT_SECONDS
        )

        latency_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "endpoint=lead_score status=success prompt_tokens=%s completion_tokens=%s latency_ms=%s model=%s",
            prompt_tokens,
            completion_tokens,
            latency_ms,
            MODEL_NAME,
        )
        return LeadScoreResponse(score=score, tier=tier, factors=factors)

    except FutureTimeoutError:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error("endpoint=lead_score status=timeout latency_ms=%s model=%s", latency_ms, MODEL_NAME)
        raise HTTPException(status_code=500, detail="Gemini request timed out")

    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        logger.error(
            "endpoint=lead_score status=error latency_ms=%s model=%s error=%s", latency_ms, MODEL_NAME, str(exc)
        )
        raise HTTPException(status_code=500, detail="Internal error scoring lead")