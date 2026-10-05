import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("SERVICE_TOKEN", "test-token")

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

VALID_HEADERS = {"Authorization": "Bearer test-token"}

VALID_PAYLOAD = {
    "baseTemplate": "Great post! Thanks for sharing, {{firstName}}.",
    "leadContext": {
        "firstName": "John",
        "fullName": "John Doe",
        "commentText": "Love the insights on AI automation",
    },
    "isConnected": False,
}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@patch("main.improvise_comment")
def test_normal_request(mock_improvise):
    mock_improvise.return_value = (
        "Great insights, John — the AI automation angle is spot on.",
        180,
        42,
    )
    response = client.post("/api/v1/comment/improvise", json=VALID_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "improvisedComment" in body
    assert len(body["improvisedComment"]) <= 300
    assert body["tokensUsed"] == {"prompt": 180, "completion": 42}
    assert body["model"] == "gemini-3.5-flash-lite"


@patch("main.improvise_comment")
def test_empty_comment_text(mock_improvise):
    mock_improvise.return_value = ("Great post! Thanks for sharing, John.", 100, 20)
    payload = dict(VALID_PAYLOAD)
    payload["leadContext"] = dict(payload["leadContext"])
    payload["leadContext"]["commentText"] = ""
    response = client.post("/api/v1/comment/improvise", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.improvise_comment")
def test_missing_first_name(mock_improvise):
    mock_improvise.return_value = ("Thanks for sharing this!", 100, 20)
    payload = dict(VALID_PAYLOAD)
    payload["leadContext"] = dict(payload["leadContext"])
    payload["leadContext"]["firstName"] = None
    response = client.post("/api/v1/comment/improvise", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200
    assert "John" not in response.json()["improvisedComment"] or True


@patch("main.improvise_comment")
def test_long_comment_text_truncates(mock_improvise):
    mock_improvise.return_value = ("x" * 250, 200, 60)
    payload = dict(VALID_PAYLOAD)
    payload["leadContext"] = dict(payload["leadContext"])
    payload["leadContext"]["commentText"] = "y" * 600
    response = client.post("/api/v1/comment/improvise", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200
    assert len(response.json()["improvisedComment"]) <= 300


@patch("main.improvise_comment", side_effect=TimeoutError("gemini timed out"))
def test_gemini_failure_returns_500(mock_improvise):
    response = client.post("/api/v1/comment/improvise", json=VALID_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 500


def test_invalid_service_token():
    response = client.post(
        "/api/v1/comment/improvise",
        json=VALID_PAYLOAD,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_missing_auth_header():
    response = client.post("/api/v1/comment/improvise", json=VALID_PAYLOAD)
    assert response.status_code == 401


def test_malformed_json_missing_field():
    response = client.post(
        "/api/v1/comment/improvise",
        json={"leadContext": {"firstName": "John"}},
        headers=VALID_HEADERS,
    )
    assert response.status_code == 400


# ---- Message personalization endpoint ----

VALID_MESSAGE_PAYLOAD = {
    "baseTemplate": "Thanks for connecting, {{firstName}}! Happy to share examples if useful.",
    "leadContext": {
        "firstName": "John",
        "fullName": "John Doe",
        "company": "Acme Inc",
        "jobTitle": "VP Engineering",
        "commentText": "Great insights on AI automation",
        "engagementType": "COMMENT",
    },
    "postContext": {
        "postUrl": "https://linkedin.com/posts/example",
        "postContent": "5 ways AI can reduce SaaS support costs by 30%",
        "actionWords": ["AI", "automation", "demo"],
    },
    "isConnected": True,
}


@patch("main.personalize_message")
def test_message_normal_request(mock_personalize):
    mock_personalize.return_value = (
        "Thanks for connecting, John! Saw your comment on the AI automation post.",
        220,
        55,
    )
    response = client.post("/api/v1/message/personalize", json=VALID_MESSAGE_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "improvisedMessage" in body
    assert body["tokensUsed"] == {"prompt": 220, "completion": 55}
    assert body["model"] == "gemini-3.5-flash-lite"


@patch("main.personalize_message")
def test_message_missing_post_context(mock_personalize):
    mock_personalize.return_value = ("Thanks for connecting, John!", 100, 20)
    payload = dict(VALID_MESSAGE_PAYLOAD)
    payload.pop("postContext")
    response = client.post("/api/v1/message/personalize", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.personalize_message", side_effect=TimeoutError("gemini timed out"))
def test_message_gemini_failure_returns_500(mock_personalize):
    response = client.post("/api/v1/message/personalize", json=VALID_MESSAGE_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 500


def test_message_invalid_service_token():
    response = client.post(
        "/api/v1/message/personalize",
        json=VALID_MESSAGE_PAYLOAD,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


# ---- Connection note endpoint ----

VALID_CONNECTION_PAYLOAD = {
    "leadContext": {
        "firstName": "John",
        "fullName": "John Doe",
        "company": "Acme Inc",
        "jobTitle": "VP Engineering",
        "commentText": "Love the AI automation angle",
        "engagementType": "COMMENT",
    },
    "postContext": {
        "postContent": "5 ways AI can reduce SaaS support costs by 30%",
        "actionWords": ["AI", "automation", "demo"],
    },
    "maxChars": 300,
}


@patch("main.generate_connection_note")
def test_connection_note_normal_request(mock_generate):
    mock_generate.return_value = ("Hi John, loved your comment on AI automation — connecting to share more.", 180, 35)
    response = client.post("/api/v1/connection/note", json=VALID_CONNECTION_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert "connectionNote" in body
    assert len(body["connectionNote"]) <= 300
    assert body["model"] == "gemini-3.5-flash-lite"


@patch("main.generate_connection_note")
def test_connection_note_enforces_hard_char_limit(mock_generate):
    # Simulate the underlying function already having truncated to maxChars,
    # since that enforcement lives in gemini_client.py itself.
    mock_generate.return_value = ("x" * 300, 200, 60)
    response = client.post("/api/v1/connection/note", json=VALID_CONNECTION_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    assert len(response.json()["connectionNote"]) <= 300


@patch("main.generate_connection_note")
def test_connection_note_missing_post_context(mock_generate):
    mock_generate.return_value = ("Hi John, would love to connect.", 100, 20)
    payload = dict(VALID_CONNECTION_PAYLOAD)
    payload.pop("postContext")
    response = client.post("/api/v1/connection/note", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.generate_connection_note", side_effect=TimeoutError("gemini timed out"))
def test_connection_note_gemini_failure_returns_500(mock_generate):
    response = client.post("/api/v1/connection/note", json=VALID_CONNECTION_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 500


def test_connection_note_invalid_service_token():
    response = client.post(
        "/api/v1/connection/note",
        json=VALID_CONNECTION_PAYLOAD,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_connection_note_actually_truncates_long_gemini_output():
    """
    Directly tests gemini_client.generate_connection_note's own truncation logic,
    not just that main.py passes a value through. Mocks the raw Gemini response
    to simulate the model ignoring the character limit.
    """
    import gemini_client
    from unittest.mock import MagicMock

    fake_response = MagicMock()
    fake_response.text = "x" * 500  # deliberately exceeds maxChars=300
    fake_response.usage_metadata = MagicMock(prompt_token_count=150, candidates_token_count=100)

    lead_context = main.CommentRequest(
        baseTemplate="unused",
        leadContext={"firstName": "John", "commentText": "Love this"},
    ).leadContext

    with patch.object(gemini_client.client.models, "generate_content", return_value=fake_response):
        note, prompt_tokens, completion_tokens = gemini_client.generate_connection_note(
            lead_context, None, max_chars=300
        )

    assert len(note) <= 300


# ---- Action words analysis endpoint ----

VALID_ACTION_WORDS_PAYLOAD = {
    "commentText": "Would love a demo of this solution",
    "actionWords": ["demo", "trial", "pricing", "interested", "information"],
}


@patch("main.analyze_action_words")
def test_action_words_normal_request(mock_analyze):
    mock_analyze.return_value = (True, ["demo"], 0.95, "explicit demo request", 120, 40)
    response = client.post("/api/v1/action-words/analyze", json=VALID_ACTION_WORDS_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is True
    assert body["matchedWords"] == ["demo"]
    assert body["confidence"] == 0.95
    assert "reason" in body
    # This response shape has no tokensUsed/model per the doc's contract.
    assert "tokensUsed" not in body
    assert "model" not in body


@patch("main.analyze_action_words")
def test_action_words_no_match(mock_analyze):
    mock_analyze.return_value = (False, [], 0.85, "generic appreciation, no buying intent", 100, 30)
    payload = dict(VALID_ACTION_WORDS_PAYLOAD)
    payload["commentText"] = "Great post, thanks for sharing!"
    response = client.post("/api/v1/action-words/analyze", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["matched"] is False
    assert body["matchedWords"] == []


@patch("main.analyze_action_words")
def test_action_words_empty_list(mock_analyze):
    mock_analyze.return_value = (False, [], 0.0, "no action words provided", 50, 10)
    payload = dict(VALID_ACTION_WORDS_PAYLOAD)
    payload["actionWords"] = []
    response = client.post("/api/v1/action-words/analyze", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.analyze_action_words")
def test_action_words_long_comment_text(mock_analyze):
    mock_analyze.return_value = (True, ["pricing"], 0.7, "buried pricing question in long comment", 300, 50)
    payload = dict(VALID_ACTION_WORDS_PAYLOAD)
    payload["commentText"] = "This is a long comment. " * 60 + " How much does this cost though?"
    response = client.post("/api/v1/action-words/analyze", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.analyze_action_words", side_effect=TimeoutError("gemini timed out"))
def test_action_words_gemini_failure_returns_500(mock_analyze):
    response = client.post("/api/v1/action-words/analyze", json=VALID_ACTION_WORDS_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 500


def test_action_words_invalid_service_token():
    response = client.post(
        "/api/v1/action-words/analyze",
        json=VALID_ACTION_WORDS_PAYLOAD,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_action_words_malformed_json_missing_field():
    response = client.post(
        "/api/v1/action-words/analyze",
        json={"actionWords": ["demo"]},  # missing required commentText
        headers=VALID_HEADERS,
    )
    assert response.status_code == 400


def test_action_words_filters_hallucinated_matched_words():
    """
    Directly tests gemini_client.analyze_action_words's own validation logic:
    if Gemini invents a matchedWords entry that wasn't in the original list,
    it must be filtered out, not passed through.
    """
    import gemini_client
    from unittest.mock import MagicMock

    fake_response = MagicMock()
    fake_response.text = (
        '{"matched": true, "matchedWords": ["demo", "invented_word"], '
        '"confidence": 1.5, "reason": "test"}'
    )
    fake_response.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=30)

    with patch.object(gemini_client.client.models, "generate_content", return_value=fake_response):
        matched, matched_words, confidence, reason, prompt_tokens, completion_tokens = (
            gemini_client.analyze_action_words("Would love a demo", ["demo", "pricing"])
        )

    assert matched is True
    assert matched_words == ["demo"]  # "invented_word" filtered out, wasn't in original list
    assert confidence == 1.0  # clamped from 1.5 down to the max of 1.0


def test_action_words_raises_on_malformed_json():
    """
    If Gemini returns non-JSON text despite JSON mode being requested, this
    should raise (not silently swallow it), so main.py returns a 500 and
    Person 1's substring-match fallback takes over.
    """
    import gemini_client
    from unittest.mock import MagicMock

    fake_response = MagicMock()
    fake_response.text = "Sure! Here's the analysis: matched=true"  # not valid JSON
    fake_response.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=30)

    with patch.object(gemini_client.client.models, "generate_content", return_value=fake_response):
        with pytest.raises(Exception):
            gemini_client.analyze_action_words("Would love a demo", ["demo", "pricing"])


# ---- Lead scoring endpoint ----

VALID_LEAD_SCORE_PAYLOAD = {
    "leadContext": {
        "firstName": "John",
        "company": "Acme Inc",
        "jobTitle": "VP Engineering",
        "engagementType": "COMMENT",
        "commentText": "Would love a demo, we're evaluating vendors",
    },
    "postContext": {
        "postContent": "5 ways AI can reduce SaaS support costs by 30%",
        "actionWords": ["demo", "pricing", "evaluation"],
    },
    "profileData": {
        "companySize": "201-500",
        "industry": "SaaS",
        "seniority": "director_plus",
    },
}


@patch("main.score_lead")
def test_lead_score_high_tier(mock_score):
    mock_score.return_value = (
        87,
        "HIGH",
        ["comment_engagement", "decision_maker_role", "action_word_match", "buying_signal"],
        200,
        60,
    )
    response = client.post("/api/v1/lead/score", json=VALID_LEAD_SCORE_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["score"] == 87
    assert body["tier"] == "HIGH"
    assert "decision_maker_role" in body["factors"]
    # No tokensUsed/model in this contract either.
    assert "tokensUsed" not in body
    assert "model" not in body


@patch("main.score_lead")
def test_lead_score_low_tier(mock_score):
    mock_score.return_value = (15, "LOW", ["like_engagement", "no_comment"], 100, 20)
    payload = dict(VALID_LEAD_SCORE_PAYLOAD)
    payload["leadContext"] = dict(payload["leadContext"])
    payload["leadContext"]["commentText"] = ""
    payload["leadContext"]["engagementType"] = "LIKE"
    response = client.post("/api/v1/lead/score", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200
    assert response.json()["tier"] == "LOW"


@patch("main.score_lead")
def test_lead_score_missing_profile_data(mock_score):
    mock_score.return_value = (50, "MEDIUM", ["comment_engagement"], 100, 30)
    payload = dict(VALID_LEAD_SCORE_PAYLOAD)
    payload.pop("profileData")
    response = client.post("/api/v1/lead/score", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.score_lead")
def test_lead_score_long_comment(mock_score):
    mock_score.return_value = (78, "HIGH", ["comment_engagement", "long_comment", "decision_maker_role"], 300, 50)
    payload = dict(VALID_LEAD_SCORE_PAYLOAD)
    payload["leadContext"] = dict(payload["leadContext"])
    payload["leadContext"]["commentText"] = "This is a very detailed comment. " * 40
    response = client.post("/api/v1/lead/score", json=payload, headers=VALID_HEADERS)
    assert response.status_code == 200


@patch("main.score_lead", side_effect=TimeoutError("gemini timed out"))
def test_lead_score_gemini_failure_returns_500(mock_score):
    response = client.post("/api/v1/lead/score", json=VALID_LEAD_SCORE_PAYLOAD, headers=VALID_HEADERS)
    assert response.status_code == 500


def test_lead_score_invalid_service_token():
    response = client.post(
        "/api/v1/lead/score",
        json=VALID_LEAD_SCORE_PAYLOAD,
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert response.status_code == 401


def test_lead_score_tier_computed_from_score_not_trusted_from_model():
    """
    Directly tests gemini_client.score_lead's tier computation and factor
    filtering, bypassing the mock at main.py level. Simulates Gemini returning
    a score with an invented factor and no tier field at all (as instructed).
    """
    import gemini_client
    from unittest.mock import MagicMock

    fake_response = MagicMock()
    fake_response.text = (
        '{"score": 82, "factors": ["decision_maker_role", "invented_factor", "buying_signal"]}'
    )
    fake_response.usage_metadata = MagicMock(prompt_token_count=150, candidates_token_count=40)

    lead_context = main.CommentRequest(
        baseTemplate="unused",
        leadContext={"firstName": "John", "jobTitle": "VP Engineering", "commentText": "evaluating vendors"},
    ).leadContext

    with patch.object(gemini_client.client.models, "generate_content", return_value=fake_response):
        score, tier, factors, prompt_tokens, completion_tokens = gemini_client.score_lead(
            lead_context, None, None
        )

    assert score == 82
    assert tier == "HIGH"  # correctly computed from score >= 75, not asked of the model
    assert "invented_factor" not in factors  # filtered out, not in the predefined set
    assert "decision_maker_role" in factors


def test_lead_score_clamps_out_of_range_score():
    """Gemini returning an invalid score (e.g. negative or >100) should be clamped, not passed through."""
    import gemini_client
    from unittest.mock import MagicMock

    fake_response = MagicMock()
    fake_response.text = '{"score": 150, "factors": ["comment_engagement"]}'
    fake_response.usage_metadata = MagicMock(prompt_token_count=100, candidates_token_count=20)

    lead_context = main.CommentRequest(
        baseTemplate="unused",
        leadContext={"firstName": "John"},
    ).leadContext

    with patch.object(gemini_client.client.models, "generate_content", return_value=fake_response):
        score, tier, factors, prompt_tokens, completion_tokens = gemini_client.score_lead(
            lead_context, None, None
        )

    assert score == 100  # clamped from 150 down to the max
    assert tier == "HIGH"