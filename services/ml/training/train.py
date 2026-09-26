import sys
import torch
import torch.nn as nn
from pathlib import Path
from torch.utils.data import DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup

# Ensure service root (services/ml) is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from training.dataset import GroundingDataset

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATASETS_DIR = REPO_ROOT / "datasets" / "processed"
OUTPUT_MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "groundguard-deberta-v1"

# Hyperparameters
BASE_MODEL_NAME = "cross-encoder/nli-deberta-v3-small"
EPOCHS = 3
BATCH_SIZE = 4
LEARNING_RATE = 2e-5
WEIGHT_DECAY = 0.01
MAX_LENGTH = 512

def train():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 Training GroundGuard DeBERTa-v1 on device: {device}")

    # 1. Load Tokenizer & Base Model
    print(f"Loading base weights from: {BASE_MODEL_NAME}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL_NAME)
    model.to(device)

    # 2. Prepare DataLoaders
    train_dataset = GroundingDataset(DATASETS_DIR / "train.jsonl", tokenizer, max_length=MAX_LENGTH)
    val_dataset = GroundingDataset(DATASETS_DIR / "val.jsonl", tokenizer, max_length=MAX_LENGTH)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE, shuffle=False)

    print(f"Training samples: {len(train_dataset)} | Validation samples: {len(val_dataset)}")

    # 3. Class-Weighted Loss (Contradiction: 2.0, Entailment: 1.0, Neutral: 1.5)
    class_weights = torch.tensor([2.0, 1.0, 1.5], dtype=torch.float).to(device)
    loss_fn = nn.CrossEntropyLoss(weight=class_weights)

    # 4. Optimizer & LR Scheduler
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
    total_steps = len(train_loader) * EPOCHS
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(total_steps * 0.1),
        num_training_steps=total_steps
    )

    best_val_loss = float("inf")

    # 5. Training Loop
    for epoch in range(1, EPOCHS + 1):
        model.train()
        total_train_loss = 0.0

        for step, batch in enumerate(train_loader):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            optimizer.zero_grad()
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            logits = outputs.logits

            loss = loss_fn(logits, labels)
            loss.backward()

            # Gradient clipping to prevent exploding gradients
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

            optimizer.step()
            scheduler.step()
            total_train_loss += loss.item()

        avg_train_loss = total_train_loss / len(train_loader)

        # Validation Pass
        model.eval()
        total_val_loss = 0.0
        val_correct = 0

        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                loss = loss_fn(outputs.logits, labels)
                total_val_loss += loss.item()

                preds = torch.argmax(outputs.logits, dim=-1)
                val_correct += (preds == labels).sum().item()

        avg_val_loss = total_val_loss / len(val_loader)
        val_acc = (val_correct / len(val_dataset)) * 100

        print(f"Epoch {epoch}/{EPOCHS} -> Train Loss: {avg_train_loss:.4f} | Val Loss: {avg_val_loss:.4f} | Val Acc: {val_acc:.1f}%")

        # Save Best Model Checkpoint
        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            OUTPUT_MODEL_DIR.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(OUTPUT_MODEL_DIR)
            tokenizer.save_pretrained(OUTPUT_MODEL_DIR)
            print(f"  ⭐ Checkpoint saved to: {OUTPUT_MODEL_DIR}")

    print("\n🎉 Fine-Tuning Completed Successfully!")
    print(f"Fine-tuned model weights saved at: {OUTPUT_MODEL_DIR}")

if __name__ == "__main__":
    train()