import json
import logging

from google import genai
from google.genai import types

from config import settings
from schemas import LeadContext, PostContext

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.GEMINI_API_KEY)

MODEL_NAME = "gemini-3.5-flash-lite"

# --- Comment improvisation (rewrite base template into a personalized comment) ---

MAX_OUTPUT_TOKENS = 80
TEMPERATURE = 0.9
MAX_COMMENT_LENGTH = 300

SYSTEM_PROMPT = (
    "Rewrite the template into a 1-2 line LinkedIn comment that references "
    "the person's specific comment. Use their first name if available. "
    "Sound natural, not salesy. Write like a real person typing quickly, not "
    "like an AI. Do not use em dashes or hyphens as punctuation (no ' — ' or "
    "' - '). Use plain sentences with periods or commas instead. Output ONLY "
    "the comment.\n\n"
    "Examples:\n"
    "Template: Would you be open to connecting and exchanging insights?\n"
    "Name: Priya | Comment: This changed how I think about hiring\n"
    "-> Priya, that reframe on hiring is exactly what more teams need to hear. Would love to connect.\n\n"
    "Template: I'd be happy to connect and exchange insights. Would you be open to it?\n"
    "Name: Sarah | Comment: The point about technical debt slowing feature velocity resonated\n"
    "-> Sarah, that tradeoff is so underrated. Happy to connect if you're open to it.\n\n"
    "Template: Would love to connect and learn from each other.\n"
    "Name: Elena | Comment: I disagree, remote-first teams actually communicate better\n"
    "-> Elena, fair pushback. Would love to hear more about your take on remote-first teams."
)

def validate_comment_length(text: str) -> bool:
    """Returns True if the comment is within the allowed length."""
    return bool(text) and len(text) <= MAX_COMMENT_LENGTH


def _build_prompt(base_template: str, lead_context: LeadContext, is_connected: bool) -> str:
    return (
        f"Base template: {base_template}\n"
        f"First name: {lead_context.firstName or ''}\n"
        f"Full name: {lead_context.fullName or ''}\n"
        f"Their comment: {lead_context.commentText or ''}\n"
        f"Already connected: {is_connected}"
    )


def _fallback_comment(base_template: str, lead_context: LeadContext) -> str:
    first_name = lead_context.firstName or ""
    return base_template.replace("{{firstName}}", first_name)


def improvise_comment(base_template: str, lead_context: LeadContext, is_connected: bool):
    """
    Calls Gemini to rewrite base_template into a personalized 1-2 line comment.
    Returns a tuple: (comment_text, prompt_tokens, completion_tokens)
    Raises an exception on failure so the caller can decide on fallback/error handling.
    """
    prompt = _build_prompt(base_template, lead_context, is_connected)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=TEMPERATURE,
            max_output_tokens=MAX_OUTPUT_TOKENS,
        ),
    )

    comment = (response.text or "").strip()

    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    if not validate_comment_length(comment):
        comment = comment[:MAX_COMMENT_LENGTH].rstrip()

    if not comment:
        comment = _fallback_comment(base_template, lead_context)

    return comment, prompt_tokens, completion_tokens


# ---- Message personalization (DM after connection) ----

MESSAGE_MAX_OUTPUT_TOKENS = 200
MESSAGE_TEMPERATURE = 0.7
MESSAGE_RECOMMENDED_MAX_CHARS = 500

SYSTEM_PROMPT_MESSAGE = (
    "Rewrite the template into a short, natural LinkedIn DM to send after connecting. "
    "Reference their specific comment or engagement on the post if given. Use their "
    "first name naturally. Mention the post topic or their company/role only if it "
    "fits naturally, don't force it. One short paragraph, conversational tone, not "
    "salesy. Write like a real person typing, not like an AI. Do not use em dashes "
    "or hyphens as punctuation (no ' — ' or ' - '). Use plain sentences with periods "
    "or commas instead. Output ONLY the message.\n\n"
    "Examples:\n"
    "Template: Thanks for connecting, {{firstName}}! Happy to share examples if useful.\n"
    "Name: John | Comment: Great insights on AI automation | Post topic: reducing SaaS support costs with AI\n"
    "-> Thanks for connecting, John! Saw your comment on the AI automation post. Happy to "
    "share a couple of relevant examples if useful.\n\n"
    "Template: Thanks for connecting! Let me know if you'd like to chat sometime.\n"
    "Name: Priya | Comment: (none) | Post topic: hiring for remote teams\n"
    "-> Thanks for connecting, Priya! Always glad to swap notes on remote hiring, let me "
    "know if you'd like to chat sometime.\n\n"
    "Template: Thanks for connecting, {{firstName}}!\n"
    "Name: David | Comment: This is a great breakdown of sales comp plans | Post topic: sales comp structure\n"
    "-> Thanks for connecting, David! Glad the comp plan breakdown was useful. Happy to dig "
    "deeper into any part of it."
)

def _build_message_prompt(base_template: str, lead_context: LeadContext, post_context: PostContext, is_connected: bool) -> str:
    post_context = post_context or PostContext()
    return (
        f"Base template: {base_template}\n"
        f"First name: {lead_context.firstName or ''}\n"
        f"Company: {lead_context.company or ''}\n"
        f"Job title: {lead_context.jobTitle or ''}\n"
        f"Their comment: {lead_context.commentText or ''}\n"
        f"Engagement type: {lead_context.engagementType or ''}\n"
        f"Post topic: {post_context.postContent or ''}\n"
        f"Already connected: {is_connected}"
    )


def _fallback_message(base_template: str, lead_context: LeadContext) -> str:
    first_name = lead_context.firstName or ""
    return base_template.replace("{{firstName}}", first_name)


def personalize_message(base_template: str, lead_context: LeadContext, post_context: PostContext, is_connected: bool):
    """
    Calls Gemini to rewrite base_template into a personalized post-connection DM.
    Returns a tuple: (message_text, prompt_tokens, completion_tokens)
    Raises an exception on failure so the caller can decide on fallback/error handling.
    """
    prompt = _build_message_prompt(base_template, lead_context, post_context, is_connected)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT_MESSAGE,
            temperature=MESSAGE_TEMPERATURE,
            max_output_tokens=MESSAGE_MAX_OUTPUT_TOKENS,
        ),
    )

    message = (response.text or "").strip()

    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    if len(message) > MESSAGE_RECOMMENDED_MAX_CHARS:
        logger.warning(
            "message length %s exceeded recommended %s chars", len(message), MESSAGE_RECOMMENDED_MAX_CHARS
        )

    if not message:
        message = _fallback_message(base_template, lead_context)

    return message, prompt_tokens, completion_tokens


# ---- Connection note generator (no baseTemplate — written from scratch) ----

CONNECTION_MAX_OUTPUT_TOKENS = 100
CONNECTION_TEMPERATURE = 0.9
CONNECTION_DEFAULT_MAX_CHARS = 300

SYSTEM_PROMPT_CONNECTION = (
    "Write a short LinkedIn connection request note referencing the person's "
    "specific comment or engagement, if given. Natural, not salesy. Stay well "
    "under the character limit provided. Write like a real person typing a quick "
    "note, not like an AI. Do not use em dashes or hyphens as punctuation "
    "(no ' — ' or ' - '). Use plain sentences with periods or commas instead. "
    "Output ONLY the note, no greeting label, no quotes.\n\n"
    "Examples:\n"
    "Name: Priya | Comment: This changed how I think about hiring | Max chars: 300\n"
    "-> Hi Priya, your take on hiring really stuck with me. Would love to connect.\n\n"
    "Name: Tom | Comment: (none) | Post topic: reducing SaaS support costs with AI | Max chars: 300\n"
    "-> Hi Tom, enjoyed your engagement on the AI support-cost post, connecting to swap notes.\n\n"
    "Name: Sarah | Comment: Love the AI automation angle | Post topic: 5 ways AI cuts SaaS support costs | Max chars: 300\n"
    "-> Hi Sarah, loved your comment on the AI automation angle. Connecting to share more."
)


def validate_connection_note_length(text: str, max_chars: int) -> bool:
    """Returns True if the note is within the given hard character limit."""
    return bool(text) and len(text) <= max_chars


def _build_connection_prompt(lead_context: LeadContext, post_context: PostContext, max_chars: int) -> str:
    post_context = post_context or PostContext()
    return (
        f"Name: {lead_context.firstName or ''}\n"
        f"Comment: {lead_context.commentText or '(none)'}\n"
        f"Post topic: {post_context.postContent or ''}\n"
        f"Max chars: {max_chars}"
    )


def _fallback_connection_note(lead_context: LeadContext, max_chars: int) -> str:
    first_name = lead_context.firstName or "there"
    note = f"Hi {first_name}, would love to connect."
    return note[:max_chars]


def generate_connection_note(lead_context: LeadContext, post_context: PostContext, max_chars: int = CONNECTION_DEFAULT_MAX_CHARS):
    """
    Calls Gemini to write a LinkedIn connection note from scratch (no base template).
    Returns a tuple: (note_text, prompt_tokens, completion_tokens)
    ALWAYS enforces max_chars as a hard limit before returning, since LinkedIn's
    own UI physically rejects longer notes.
    Raises an exception on failure so the caller can decide on fallback/error handling.
    """
    prompt = _build_connection_prompt(lead_context, post_context, max_chars)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT_CONNECTION,
            temperature=CONNECTION_TEMPERATURE,
            max_output_tokens=CONNECTION_MAX_OUTPUT_TOKENS,
        ),
    )

    note = (response.text or "").strip()

    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    if not note:
        note = _fallback_connection_note(lead_context, max_chars)

    if not validate_connection_note_length(note, max_chars):
        note = note[:max_chars].rstrip()

    return note, prompt_tokens, completion_tokens


# ---- Semantic action words analyzer ----

ACTION_WORDS_MAX_OUTPUT_TOKENS = 150
ACTION_WORDS_TEMPERATURE = 0.2  

SYSTEM_PROMPT_ACTION_WORDS = (
    "You analyze a LinkedIn comment to decide if it semantically matches any of "
    "the given action words, based on meaning and intent, not just exact word "
    "matches. Match synonyms and paraphrases (e.g. 'demo' matches 'walkthrough' "
    "or 'show me'; 'interested' matches 'want to learn' or 'curious about'; "
    "'pricing' matches 'cost', 'price', 'how much', 'budget'). Detect negation "
    "carefully: 'not interested' must NOT match 'interested'. Detect questions "
    "that imply intent even without the exact word (e.g. 'how much is this?' "
    "implies pricing interest).\n\n"
    "Respond with ONLY a JSON object, no other text, in exactly this shape:\n"
    '{"matched": true or false, "matchedWords": [list of action words from the '
    'given list that matched], "confidence": a number from 0 to 1, "reason": '
    '"a short explanation"}\n\n'
    "Examples:\n"
    'Comment: "Would love a demo of this solution" | Action words: ["demo", "trial", "pricing"]\n'
    '-> {"matched": true, "matchedWords": ["demo"], "confidence": 0.95, "reason": "explicit demo request"}\n\n'
    'Comment: "Not interested, thanks" | Action words: ["interested", "demo", "pricing"]\n'
    '-> {"matched": false, "matchedWords": [], "confidence": 0.9, "reason": "explicit negation of interest"}\n\n'
    'Comment: "How much does this cost?" | Action words: ["pricing", "demo"]\n'
    '-> {"matched": true, "matchedWords": ["pricing"], "confidence": 0.9, "reason": "question implies pricing interest"}'
)

def _build_action_words_prompt(comment_text: str, action_words: list) -> str:
    return f'Comment: "{comment_text}" | Action words: {action_words}'


def analyze_action_words(comment_text: str, action_words: list):
    """
    Calls Gemini to semantically match a comment against a list of action words.
    Returns a tuple: (matched, matched_words, confidence, reason, prompt_tokens, completion_tokens)
    Raises an exception on failure (including malformed JSON) so the caller can
    return a 500 and let Person 1's substring-match fallback take over.
    """
    prompt = _build_action_words_prompt(comment_text, action_words)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT_ACTION_WORDS,
            temperature=ACTION_WORDS_TEMPERATURE,
            max_output_tokens=ACTION_WORDS_MAX_OUTPUT_TOKENS,
            response_mime_type="application/json",
        ),
    )

    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    raw_text = (response.text or "").strip()
    data = json.loads(raw_text)

    matched_words_raw = data.get("matchedWords", [])
    if not isinstance(matched_words_raw, list):
        matched_words_raw = []

    matched_words = [w for w in matched_words_raw if w in action_words]

    confidence = data.get("confidence", 0.0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    matched = bool(data.get("matched", False))
    reason = str(data.get("reason", ""))[:500]

    return matched, matched_words, confidence, reason, prompt_tokens, completion_tokens


# ---- Lead scoring ----

LEAD_SCORE_MAX_OUTPUT_TOKENS = 200
LEAD_SCORE_TEMPERATURE = 0.2 

VALID_FACTORS = {
    "comment_engagement", "like_engagement", "decision_maker_role", "influencer_role",
    "action_word_match", "strong_buying_signal", "buying_signal", "company_fit",
    "industry_fit", "seniority_fit", "long_comment", "short_comment", "no_comment",
}

SYSTEM_PROMPT_LEAD_SCORE = (
    "You score how promising a LinkedIn lead is, from 0 to 100, based on their "
    "engagement, job seniority, company fit, and any buying signals. Weigh these "
    "together, don't just pick the strongest single signal:\n"
    "- A comment counts for more than a like.\n"
    "- Longer, more specific comments count for more than short generic ones.\n"
    "- Job titles like VP, Director, Head, or C-level indicate a decision maker.\n"
    "- Action word matches (e.g. demo, pricing) suggest buying interest; explicit "
    "language like 'evaluating', 'vendor', 'budget', or 'timeline' is a stronger "
    "buying signal than a single matched word.\n"
    "- Company size/industry fit with the post topic adds to the score.\n\n"
    "Respond with ONLY a JSON object, no other text, in exactly this shape:\n"
    '{"score": integer 0-100, "factors": [list of factor strings from the '
    "allowed set below that applied to this lead]}\n\n"
    "Do NOT include a tier in your response, only score and factors.\n\n"
    "Allowed factor strings (use ONLY these, exactly as written):\n"
    "comment_engagement, like_engagement, decision_maker_role, influencer_role, "
    "action_word_match, strong_buying_signal, buying_signal, company_fit, "
    "industry_fit, seniority_fit, long_comment, short_comment, no_comment\n\n"
    "Examples:\n\n"
    "Lead: VP Engineering | Comment: \"Would love a demo, we're evaluating vendors\" "
    "| Action words matched: demo, evaluation | Company: 201-500, SaaS | Post topic: AI reducing SaaS support costs\n"
    '-> {"score": 87, "factors": ["comment_engagement", "decision_maker_role", '
    '"action_word_match", "strong_buying_signal", "company_fit", "industry_fit"]}\n\n'
    "Lead: Software Engineer | Engagement: LIKE only, no comment | Action words matched: none "
    "| Company: 1-10, Retail | Post topic: AI reducing SaaS support costs\n"
    '-> {"score": 15, "factors": ["like_engagement", "no_comment"]}\n\n'
    "Lead: Marketing Manager | Comment: \"Interesting read, thanks for sharing\" "
    "| Action words matched: none | Company: 51-200, SaaS | Post topic: AI reducing SaaS support costs\n"
    '-> {"score": 42, "factors": ["comment_engagement", "short_comment", "industry_fit"]}\n\n'
    "Lead: Director of Ops | Comment: \"We've been looking at automation options for our "
    "support team, curious how this compares to what we're already using\" "
    "| Action words matched: automation | Company: 201-500, SaaS | Post topic: AI reducing SaaS support costs\n"
    '-> {"score": 78, "factors": ["comment_engagement", "decision_maker_role", '
    '"action_word_match", "buying_signal", "long_comment", "company_fit", "industry_fit"]}'
)


def _tier_from_score(score: int) -> str:
    """Tier is fully determined by score, so we compute it ourselves rather
    than trusting Gemini to keep score and tier consistent."""
    if score >= 75:
        return "HIGH"
    if score >= 40:
        return "MEDIUM"
    return "LOW"


def _build_lead_score_prompt(lead_context: LeadContext, post_context: PostContext, profile_data) -> str:
    post_context = post_context or PostContext()
    action_words = post_context.actionWords or []
    company_size = getattr(profile_data, "companySize", None) or ""
    industry = getattr(profile_data, "industry", None) or ""
    seniority = getattr(profile_data, "seniority", None) or ""

    return (
        f"Job title: {lead_context.jobTitle or ''}\n"
        f"Engagement type: {lead_context.engagementType or ''}\n"
        f"Comment: {lead_context.commentText or '(none)'}\n"
        f"Action words available: {action_words}\n"
        f"Post topic: {post_context.postContent or ''}\n"
        f"Company size: {company_size}\n"
        f"Industry: {industry}\n"
        f"Seniority: {seniority}"
    )


def score_lead(lead_context: LeadContext, post_context: PostContext, profile_data):
    """
    Calls Gemini to score a lead 0-100 with supporting factors.
    Returns a tuple: (score, tier, factors, prompt_tokens, completion_tokens)
    tier is computed in Python from score, never trusted from the model.
    factors are filtered to only the predefined allowed set.
    Raises an exception on failure (including malformed JSON) so the caller
    can return a 500 and let Person 1's score=50/tier=MEDIUM fallback take over.
    """
    prompt = _build_lead_score_prompt(lead_context, post_context, profile_data)

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT_LEAD_SCORE,
            temperature=LEAD_SCORE_TEMPERATURE,
            max_output_tokens=LEAD_SCORE_MAX_OUTPUT_TOKENS,
            response_mime_type="application/json",
        ),
    )

    usage = getattr(response, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    raw_text = (response.text or "").strip()
    data = json.loads(raw_text)

    score = data.get("score", 0)
    try:
        score = int(score)
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    factors_raw = data.get("factors", [])
    if not isinstance(factors_raw, list):
        factors_raw = []
    factors = [f for f in factors_raw if f in VALID_FACTORS]

    tier = _tier_from_score(score)

    return score, tier, factors, prompt_tokens, completion_tokens