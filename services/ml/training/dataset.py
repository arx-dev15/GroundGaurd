import json
import torch
from pathlib import Path
from typing import List, Dict
from torch.utils.data import Dataset
from transformers import AutoTokenizer

from src.preprocessing.pairer import text_pairer

LABEL_MAP = {
    "contradiction": 0,
    "entailment": 1,
    "neutral": 2
}

class GroundingDataset(Dataset):
    """
    PyTorch Dataset for Evidence-Claim Grounding classification.
    Reads JSONL samples and tokenizes [Evidence, Claim] pairs dynamically.
    """
    def __init__(self, jsonl_path: Path, tokenizer: AutoTokenizer, max_length: int = 512):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.samples: List[Dict] = []

        with open(jsonl_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    self.samples.append(json.loads(line))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        sample = self.samples[idx]
        evidence = text_pairer.clean_text(sample["evidence"])
        claim = text_pairer.clean_text(sample["claim"])
        label_str = sample["label"].lower()
        label_idx = LABEL_MAP[label_str]

        # Tokenize [CLS] Evidence [SEP] Claim [SEP]
        encoding = self.tokenizer(
            evidence,
            claim,
            padding="max_length",
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt"
        )

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(label_idx, dtype=torch.long)
        }