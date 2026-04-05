from database import SessionLocal, engine
from models import Base, LessonPlanTemplate, LessonPlanTemplateType


SYSTEM_TEMPLATES = [
    {
        "name": "標準教案",
        "description": "一般課堂通用結構：目標、引入、發展、鞏固、評估。",
        "content": """# 教案：{topic}

## 學習目標
- 

## 課堂引入（5-8分鐘）
- 

## 核心教學活動（20-25分鐘）
### 老師活動
- 

### 學生活動
- 

## 鞏固與總結（5-8分鐘）
- 

## 形成性評估
- 

## 家課 / 延伸活動
- 
""",
        "default_config": {
            "teaching_method": ["講授", "問答"],
            "duration_minutes": 40,
            "difficulty": "intermediate",
            "student_level": "medium",
            "assessment": ["問答", "工作紙"],
            "objectives": [],
        },
    },
    {
        "name": "探究式學習",
        "description": "以提問、假設、驗證、反思為主。",
        "content": """# 探究式教案：{topic}

## 探究問題
- 

## 學習目標
- 

## 假設與預測
- 

## 探究活動
1. 
2. 

## 數據 / 觀察記錄
- 

## 結論與反思
- 

## 評估與回饋
- 
""",
        "default_config": {
            "teaching_method": ["探究活動", "小組討論"],
            "duration_minutes": 40,
            "difficulty": "advanced",
            "student_level": "medium",
            "assessment": ["觀察紀錄", "口頭匯報"],
            "objectives": [],
        },
    },
    {
        "name": "翻轉課堂",
        "description": "課前預習 + 課堂深化 + 課後反思。",
        "content": """# 翻轉課堂教案：{topic}

## 課前任務
- 觀看／閱讀：
- 預習問題：

## 課堂目標
- 

## 課堂活動安排
### 檢核預習（8分鐘）
- 

### 同儕討論（12分鐘）
- 

### 應用練習（15分鐘）
- 

## 課後反思
- 

## 評估方式
- 
""",
        "default_config": {
            "teaching_method": ["翻轉課堂", "同儕討論"],
            "duration_minutes": 40,
            "difficulty": "intermediate",
            "student_level": "medium",
            "assessment": ["課堂練習", "反思短文"],
            "objectives": [],
        },
    },
    {
        "name": "分組協作",
        "description": "強調分工、協作、展示與互評。",
        "content": """# 分組協作教案：{topic}

## 學習目標
- 

## 分組安排
- 分組方式：
- 角色分工：

## 小組任務
- 任務內容：
- 產出要求：

## 匯報與互評
- 匯報形式：
- 互評準則：

## 老師總結與回饋
- 
""",
        "default_config": {
            "teaching_method": ["小組討論", "協作學習"],
            "duration_minutes": 40,
            "difficulty": "intermediate",
            "student_level": "high",
            "assessment": ["小組匯報", "同儕互評"],
            "objectives": [],
        },
    },
    {
        "name": "直接教學法",
        "description": "以清晰示範、引導練習、獨立練習為核心。",
        "content": """# 直接教學教案：{topic}

## 教學目標
- 

## 先備知識檢核
- 

## 明確講解與示範
- 

## 引導練習
- 

## 獨立練習
- 

## 檢核與補救
- 
""",
        "default_config": {
            "teaching_method": ["講授", "示範"],
            "duration_minutes": 40,
            "difficulty": "basic",
            "student_level": "low",
            "assessment": ["即堂小測", "口頭問答"],
            "objectives": [],
        },
    },
]


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for item in SYSTEM_TEMPLATES:
            existing = db.query(LessonPlanTemplate).filter(
                LessonPlanTemplate.template_type == LessonPlanTemplateType.system,
                LessonPlanTemplate.name == item["name"],
            ).first()
            if existing:
                continue
            db.add(
                LessonPlanTemplate(
                    name=item["name"],
                    description=item["description"],
                    content=item["content"],
                    default_config=item["default_config"],
                    template_type=LessonPlanTemplateType.system,
                    school_id=None,
                    created_by=None,
                    is_active=True,
                )
            )
        db.commit()
        print("System lesson plan templates seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
