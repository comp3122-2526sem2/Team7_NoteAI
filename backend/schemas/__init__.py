from .auth import RegisterRequest, TokenResponse
from .users import UserOut, UserUpdate
from .courses import CourseCreate, CourseUpdate, CourseOut, SyllabusUploadOut, EnrollStudentRequest, AssignTeacherRequest
from .chapters import ChapterCreate, ChapterUpdate, ChapterOut, ChapterAICommentOut, ChapterStudentPerformance
from .threads import ThreadCreate, ThreadOut
from .assignments import (
    AssignmentCreate, AssignmentUpdate, AssignmentOut,
    SubmissionCreate, SubmissionGrade, SubmissionOut,
)
from .documents import DocumentOut, DocumentUpdate, AICheckRequest
from .progress import (
    TopicProgressOut, TopicProgressUpdate,
    AIRecommendationOut, GenerateRecommendationRequest,
)
from .prompts import PromptOut, PromptUpdate

__all__ = [
    "RegisterRequest", "TokenResponse",
    "UserOut", "UserUpdate",
    "CourseCreate", "CourseUpdate", "CourseOut", "SyllabusUploadOut", "EnrollStudentRequest", "AssignTeacherRequest",
    "ChapterCreate", "ChapterUpdate", "ChapterOut", "ChapterAICommentOut", "ChapterStudentPerformance",
    "ThreadCreate", "ThreadOut",
    "AssignmentCreate", "AssignmentUpdate", "AssignmentOut",
    "SubmissionCreate", "SubmissionGrade", "SubmissionOut",
    "DocumentOut", "DocumentUpdate", "AICheckRequest",
    "TopicProgressOut", "TopicProgressUpdate",
    "AIRecommendationOut", "GenerateRecommendationRequest",
    "PromptOut", "PromptUpdate",
]
