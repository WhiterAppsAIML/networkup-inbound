from typing import List, Optional
from pydantic import BaseModel

class LeadContext(BaseModel):
    firstName: Optional[str] = None
    fullName: Optional[str] = None
    commentText: Optional[str] = ""
    company: Optional[str] = None
    jobTitle: Optional[str] = None
    engagementType: Optional[str] = None


class PostContext(BaseModel):
    postUrl: Optional[str] = None
    postContent: Optional[str] = None
    actionWords: Optional[List[str]] = None


class CommentRequest(BaseModel):
    baseTemplate: str
    leadContext: LeadContext
    isConnected: bool = False


class TokensUsed(BaseModel):
    prompt: int
    completion: int


class CommentResponse(BaseModel):
    improvisedComment: str
    tokensUsed: TokensUsed
    model: str


class MessageRequest(BaseModel):
    baseTemplate: str
    leadContext: LeadContext
    postContext: Optional[PostContext] = None
    isConnected: bool = True


class MessageResponse(BaseModel):
    improvisedMessage: str
    tokensUsed: TokensUsed
    model: str


class ConnectionNoteRequest(BaseModel):
    leadContext: LeadContext
    postContext: Optional[PostContext] = None
    maxChars: int = 300


class ConnectionNoteResponse(BaseModel):
    connectionNote: str
    tokensUsed: TokensUsed
    model: str


class ActionWordsRequest(BaseModel):
    commentText: str
    actionWords: List[str]


class ActionWordsResponse(BaseModel):
    matched: bool
    matchedWords: List[str]
    confidence: float
    reason: str


class ProfileData(BaseModel):
    companySize: Optional[str] = None
    industry: Optional[str] = None
    seniority: Optional[str] = None


class LeadScoreRequest(BaseModel):
    leadContext: LeadContext
    postContext: Optional[PostContext] = None
    profileData: Optional[ProfileData] = None


class LeadScoreResponse(BaseModel):
    score: int
    tier: str
    factors: List[str]