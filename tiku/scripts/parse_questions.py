from __future__ import annotations

import json
import re
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
SOURCE = next(ROOT.glob("*.xlsx"))
OUTPUT = ROOT / "data" / "questions.js"


def clean(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\u00a0", " ").strip()


def split_knowledge(value: object) -> list[str]:
    return [part.strip() for part in re.split(r"[;；]", clean(value)) if part.strip()]


def parse_sheet(sheet, type_key: str, type_label: str, option_count: int) -> list[dict]:
    questions: list[dict] = []
    for row_index, row in enumerate(sheet.iter_rows(min_row=4, values_only=True), start=4):
        question = clean(row[0] if len(row) > 0 else "")
        if not question:
            continue

        option_values = []
        for offset in range(option_count):
            label = clean(row[5 + offset] if len(row) > 5 + offset else "")
            if label:
                option_values.append({"key": chr(65 + offset), "label": label})

        raw_answer = clean(row[4] if len(row) > 4 else "")
        if type_key == "boolean":
            answer_keys = ["A" if raw_answer == "正确" else "B"]
            if not option_values:
                option_values = [
                    {"key": "A", "label": "正确"},
                    {"key": "B", "label": "错误"},
                ]
        else:
            answer_keys = re.findall(r"[A-Z]", raw_answer.upper())

        answer_text = "、".join(
            next((option["label"] for option in option_values if option["key"] == key), key)
            for key in answer_keys
        )
        questions.append(
            {
                "id": f"{type_key}-{len(questions) + 1}",
                "type": type_key,
                "typeLabel": type_label,
                "question": question,
                "options": option_values,
                "answer": answer_keys,
                "answerText": answer_text,
                "explanation": clean(row[3] if len(row) > 3 else ""),
                "difficulty": clean(row[2] if len(row) > 2 else "") or "未标注",
                "knowledge": split_knowledge(row[1] if len(row) > 1 else ""),
                "sourceRow": row_index,
            }
        )
    return questions


def main() -> None:
    workbook = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
    configs = [
        ("单选题", "single", "单选题", 12),
        ("多选题", "multiple", "多选题", 12),
        ("判断题", "boolean", "判断题", 0),
    ]
    questions: list[dict] = []
    for sheet_name, type_key, type_label, option_count in configs:
        questions.extend(parse_sheet(workbook[sheet_name], type_key, type_label, option_count))

    payload = {
        "source": SOURCE.name,
        "updatedAt": "2026-11-05",
        "questions": questions,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "window.QUESTION_BANK = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"写入 {OUTPUT}，共 {len(questions)} 题")


if __name__ == "__main__":
    main()
