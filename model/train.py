"""
FreeSkin - Skin Lesion Classifier Training
Dataset: HAM10000 (https://www.kaggle.com/datasets/kmader/skin-cancer-mnist-ham10000)

Expected directory layout:
    data/
        HAM10000_metadata.csv
        HAM10000_images_part_1/   (ISIC_*.jpg)
        HAM10000_images_part_2/   (ISIC_*.jpg)

Run: python train.py
"""

import os
import time
import copy
import pandas as pd
import numpy as np
from pathlib import Path
from PIL import Image

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
import timm
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR = Path("data")
IMG_DIRS = [
    DATA_DIR / "HAM10000_images_part_1",
    DATA_DIR / "HAM10000_images_part_2",
]
META_CSV = DATA_DIR / "HAM10000_metadata.csv"
CHECKPOINT_PATH = Path("checkpoints/best_model.pth")

IMAGE_SIZE = 224
BATCH_SIZE = 32
NUM_EPOCHS = 30
LR = 3e-4
WEIGHT_DECAY = 1e-4
MODEL_NAME = "efficientnet_b0"   # lightweight — converts well to TFLite
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# HAM10000 class labels (alphabetical = default CSV order)
CLASSES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]

# Risk level per class (used in Android app too — keep in sync!)
RISK = {
    "akiec": "HIGH",    # Actinic keratosis — precancerous
    "bcc":   "HIGH",    # Basal cell carcinoma — malignant
    "bkl":   "LOW",     # Benign keratosis — benign
    "df":    "LOW",     # Dermatofibroma — benign
    "mel":   "HIGH",    # Melanoma — malignant
    "nv":    "LOW",     # Melanocytic nevi — benign
    "vasc":  "LOW",     # Vascular lesions — benign
}


# ── Dataset ───────────────────────────────────────────────────────────────────
def build_image_index(img_dirs):
    """Return dict: image_id -> Path"""
    index = {}
    for d in img_dirs:
        for p in Path(d).glob("*.jpg"):
            index[p.stem] = p
    return index


class HAM10000Dataset(Dataset):
    def __init__(self, df, image_index, transform=None):
        self.df = df.reset_index(drop=True)
        self.image_index = image_index
        self.transform = transform
        self.label_map = {cls: i for i, cls in enumerate(CLASSES)}

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        img_path = self.image_index[row["image_id"]]
        image = Image.open(img_path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        label = self.label_map[row["dx"]]
        return image, label


# ── Transforms ────────────────────────────────────────────────────────────────
mean = [0.485, 0.456, 0.406]
std  = [0.229, 0.224, 0.225]

train_transforms = transforms.Compose([
    transforms.RandomResizedCrop(IMAGE_SIZE, scale=(0.8, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomVerticalFlip(),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.05),
    transforms.RandomRotation(30),
    transforms.ToTensor(),
    transforms.Normalize(mean, std),
])

val_transforms = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean, std),
])


# ── Training loop ─────────────────────────────────────────────────────────────
def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in tqdm(loader, desc="Train", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * imgs.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in tqdm(loader, desc="Val  ", leave=False):
        imgs, labels = imgs.to(device), labels.to(device)
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        total_loss += loss.item() * imgs.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print(f"Device: {DEVICE}")
    CHECKPOINT_PATH.parent.mkdir(parents=True, exist_ok=True)

    # Load metadata
    meta = pd.read_csv(META_CSV)
    print(f"Total samples: {len(meta)}")
    print(meta["dx"].value_counts())

    image_index = build_image_index(IMG_DIRS)

    # Train / val split (stratified)
    train_df, val_df = train_test_split(
        meta, test_size=0.2, stratify=meta["dx"], random_state=42
    )
    print(f"Train: {len(train_df)}  Val: {len(val_df)}")

    train_ds = HAM10000Dataset(train_df, image_index, train_transforms)
    val_ds   = HAM10000Dataset(val_df,   image_index, val_transforms)

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                              num_workers=4, pin_memory=True)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False,
                              num_workers=4, pin_memory=True)

    # Class weights (HAM10000 is very imbalanced — nv dominates)
    class_weights = compute_class_weight(
        "balanced",
        classes=np.array(CLASSES),
        y=train_df["dx"].values,
    )
    weights_tensor = torch.tensor(class_weights, dtype=torch.float).to(DEVICE)
    criterion = nn.CrossEntropyLoss(weight=weights_tensor)

    # Model
    model = timm.create_model(MODEL_NAME, pretrained=True, num_classes=len(CLASSES))
    model = model.to(DEVICE)

    optimizer = optim.AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=NUM_EPOCHS)

    best_val_acc = 0.0
    best_weights = copy.deepcopy(model.state_dict())

    for epoch in range(1, NUM_EPOCHS + 1):
        t0 = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, DEVICE)
        val_loss,   val_acc   = evaluate(model, val_loader, criterion, DEVICE)
        scheduler.step()

        elapsed = time.time() - t0
        print(
            f"Epoch {epoch:02d}/{NUM_EPOCHS}  "
            f"train_loss={train_loss:.4f}  train_acc={train_acc:.4f}  "
            f"val_loss={val_loss:.4f}  val_acc={val_acc:.4f}  "
            f"lr={scheduler.get_last_lr()[0]:.6f}  {elapsed:.0f}s"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_weights = copy.deepcopy(model.state_dict())
            torch.save({"model_state": best_weights, "val_acc": best_val_acc,
                        "classes": CLASSES, "model_name": MODEL_NAME},
                       CHECKPOINT_PATH)
            print(f"  -> Saved checkpoint (val_acc={best_val_acc:.4f})")

    print(f"\nBest val accuracy: {best_val_acc:.4f}")
    print(f"Checkpoint saved to: {CHECKPOINT_PATH}")


if __name__ == "__main__":
    main()
