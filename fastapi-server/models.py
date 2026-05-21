import torch
import torch.nn as nn
import torch
import torch.nn as nn
import torch.nn.functional as F
import timm 
class ModelA(nn.Module):
    def __init__(self):
        super().__init__()

        self.block1 = nn.Sequential(
            nn.Conv2d(3, 3, 3, padding=1),
            nn.BatchNorm2d(3),
            nn.ReLU(),

            nn.Conv2d(3, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.MaxPool2d(2, 2),
            nn.Dropout(0.3)
        )

        self.block2 = nn.Sequential(
            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.MaxPool2d(2, 2),
            nn.Dropout(0.3)
        )

        self.block3 = nn.Sequential(
            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),

            nn.MaxPool2d(2, 2),
            nn.Dropout(0.3)
        )

        self.fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(32 * 6 * 6, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.fc(x)
        return x

class ModelB(nn.Module):
    def __init__(self):
        super().__init__()

        self.features = nn.Sequential(
            # Layer 1
            nn.Conv2d(3, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.3),

            # Layer 2
            nn.Conv2d(32, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.3),

            # Layer 3
            nn.Conv2d(32, 32, 3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Dropout(0.3)
        )

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(32 * 6 * 6, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, 2)
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x



"""
Model C — ResNet-18 + Pretrained ViT-Base
==========================================
Architecture:
  - Feature Learning : Pretrained ResNet-18 (first 4 blocks, no FC)
                       Output: (B, 512, 7, 7)  for 224×224 input
  - Projection      : Conv 512 → 768, keeping spatial dims 7×7
                       → 49 patches  (matches ViT-Base's patch dim)
  - Positional emb  : learnable (1, 49, 768)
  - ViT encoder     : Pretrained google/vit-base-patch16-224-in21k (12 blocks)
  - GAP + Dropout + Linear(768→2)
 
Why ResNet-18 instead of 17 custom Conv layers:
  - ResNet-18 has skip connections → deeper effective depth without vanishing gradients
  - ImageNet-pretrained weights give far richer low/mid-level features than random init
  - The paper's 17-layer CNN was trained from scratch on FF++ (large dataset).
    With only ~300 videos, pretrained ResNet-18 generalises much better.
 
Two-phase training strategy (recommended):
  Phase 1 (freeze ViT, train CNN+head)  → ~10 epochs, lr=1e-4
  Phase 2 (unfreeze last 4 ViT layers)  → ~20 epochs, lr=5e-5
"""
 
import torch
import torch.nn as nn
from transformers import ViTModel
 
 
class ModelC(nn.Module):
 
    def __init__(self, freeze_vit: bool = True, freeze_resnet: bool = False):
        super().__init__()
 
        # ── 1. FEATURE LEARNING: Pretrained ResNet-18 backbone ──────
        # We take everything EXCEPT avgpool and fc  →  (B, 512, 7, 7)
        import torchvision.models as tvm
        resnet = tvm.resnet18(weights=tvm.ResNet18_Weights.IMAGENET1K_V1)
 
        self.feature_learning = nn.Sequential(
            resnet.conv1,       # 3  → 64,  112×112
            resnet.bn1,
            resnet.relu,
            resnet.maxpool,     # 64,  56×56
            resnet.layer1,      # 64  → 64,  56×56
            resnet.layer2,      # 64  → 128, 28×28
            resnet.layer3,      # 128 → 256, 14×14
            resnet.layer4,      # 256 → 512,  7×7
        )
        # Output shape: (B, 512, 7, 7)
 
        if freeze_resnet:
            for p in self.feature_learning.parameters():
                p.requires_grad = False
            print("ResNet-18 backbone frozen.")
 
        # ── 2. PROJECTION: 512 → 768 (ViT-Base hidden dim) ─────────
        # kernel=1, stride=1 keeps spatial size → 49 patches (7×7)
        # Using kernel=1 (pointwise) rather than kernel=7 because
        # ResNet already compressed spatial dims to 7×7.
        self.patch_proj = nn.Sequential(
            nn.Conv2d(512, 768, kernel_size=1, stride=1, bias=False),
            nn.BatchNorm2d(768),
        )
        # Output: (B, 768, 7, 7)  →  flattened to (B, 49, 768)
 
        # ── 3. POSITIONAL EMBEDDING (learnable, 49 patches) ─────────
        self.pos_embedding = nn.Parameter(
            torch.randn(1, 49, 768) * 0.02
        )
 
        # ── 4. PRETRAINED ViT ENCODER ────────────────────────────────
        print("Loading pretrained ViT-Base encoder …")
        vit = ViTModel.from_pretrained("google/vit-base-patch16-224-in21k")
        self.vit_encoder   = vit.encoder     # 12 TransformerEncoderLayer blocks
        self.vit_layernorm = vit.layernorm   # final LayerNorm
 
        if freeze_vit:
            for p in self.vit_encoder.parameters():
                p.requires_grad = False
            for p in self.vit_layernorm.parameters():
                p.requires_grad = False
            print("ViT encoder frozen  (Phase 1 — CNN + head only).")
 
        # ── 5. CLASSIFICATION HEAD ───────────────────────────────────
        self.head = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(768, 256),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(256, 2),
        )
 
        # Weight init for new layers only
        nn.init.xavier_uniform_(self.patch_proj[0].weight)
        nn.init.xavier_uniform_(self.head[1].weight)
        nn.init.xavier_uniform_(self.head[4].weight)
 
    # ────────────────────────────────────────────────────────────────
    def unfreeze_vit(self, last_n_layers: int = 4):
        """
        Call after Phase 1 to begin Phase 2 fine-tuning.
        Only unfreezes the last N transformer blocks + layernorm
        to avoid destroying pretrained weights with a large LR.
        """
        for p in self.vit_layernorm.parameters():
            p.requires_grad = True
 
        total = len(self.vit_encoder.layer)
        for i, layer in enumerate(self.vit_encoder.layer):
            if i >= total - last_n_layers:
                for p in layer.parameters():
                    p.requires_grad = True
 
        print(f"Unfroze last {last_n_layers}/{total} ViT layers + layernorm.")
 
    def unfreeze_resnet(self, last_n_blocks: int = 2):
        """
        Optionally fine-tune last N ResNet blocks in Phase 2.
        last_n_blocks=2  →  layer3 + layer4
        last_n_blocks=1  →  layer4 only  (safer)
        """
        blocks = [
            self.feature_learning[4],   # layer1
            self.feature_learning[5],   # layer2
            self.feature_learning[6],   # layer3
            self.feature_learning[7],   # layer4
        ]
        for block in blocks[-last_n_blocks:]:
            for p in block.parameters():
                p.requires_grad = True
        print(f"Unfroze last {last_n_blocks} ResNet blocks.")
 
    # ────────────────────────────────────────────────────────────────
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # (B, 3, 224, 224)
 
        # ResNet-18 feature extraction
        x = self.feature_learning(x)        # (B, 512, 7, 7)
 
        # Project to ViT hidden dim
        x = self.patch_proj(x)              # (B, 768, 7, 7)
        x = x.flatten(2).transpose(1, 2)   # (B, 49, 768)
 
        # Add positional embedding
        x = x + self.pos_embedding          # (B, 49, 768)
 
        # Pretrained ViT transformer blocks
        x = self.vit_encoder(x).last_hidden_state   # (B, 49, 768)
        x = self.vit_layernorm(x)                   # (B, 49, 768)
 
        # Global average pooling over patch dimension
        x = x.mean(dim=1)                   # (B, 768)
 
        # Classify
        return self.head(x)                 # (B, 2)
 
    # ────────────────────────────────────────────────────────────────
    def trainable_params(self) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad)
 
    def total_params(self) -> int:
        return sum(p.numel() for p in self.parameters())

# Ensure you have 'timm' installed: pip install timm

# ════════════════════════════════════════════════════════════════════
# ModelMouth — Pretrained Xception  (mouth)
# Input : (B, 3, 50, 50) — interpolated to 224×224 inside forward()
# ════════════════════════════════════════════════════════════════════
class ModelMouth(nn.Module):

    def __init__(self, freeze_base: bool = True,
                 pretrained_backbone: bool = True):
        """
        Args:
            freeze_base        : freeze Xception backbone (Phase 1)
            pretrained_backbone: True  → download ImageNet weights (training)
                                 False → skip download   (loading checkpoint)
        """
        super().__init__()

        try:
            import timm
        except ImportError:
            raise ImportError("Run: pip install timm -q")

        # ── Xception backbone ─────────────────────────────────────────
        # global_pool='' → we do our own pooling in head
        self.base = timm.create_model(
            "xception",
            pretrained=pretrained_backbone,
            num_classes=0,
            global_pool="",
        )

        if pretrained_backbone:
            print("Xception: loaded ImageNet pretrained weights.")
        else:
            print("Xception: random init (overwritten by checkpoint).")

        if freeze_base:
            for p in self.base.parameters():
                p.requires_grad = False
            print("Xception backbone frozen (Phase 1 — head only).")

        # ── Classification head ──────────────────────────────────────
        # Xception final feature dim = 2048
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Linear(2048, 512),
            nn.GELU(),
            nn.Dropout(0.4),
            nn.Linear(512, 2),
        )

        nn.init.xavier_uniform_(self.head[2].weight)
        nn.init.xavier_uniform_(self.head[5].weight)

    def universal_unfreeze(self):
     """Universal unfreeze: Targets the last 30% of the model's layers by index."""
      # 1. Freeze everything
     for p in self.base.parameters():
          p.requires_grad = False

     # 2. Get all named parameters
     all_params = list(self.base.named_parameters())
     num_params = len(all_params)
    
    # 3. Unfreeze the last 35% of the layers
    # This usually covers the entire 'Exit Flow' (blocks 10-12 and final convs)
     start_index = int(num_params * 0.65) 
    
     for i in range(start_index, num_params):
             name, param = all_params[i]
             param.requires_grad = True

     print(f"✅ Universal Unfreeze complete.")
     print(f"🚀 Trainable Parameters: {sum(p.numel() for p in self.parameters() if p.requires_grad):,}")


    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Upsample 50×50 → 224×224 inside forward (no disk overhead)
        x = F.interpolate(x, size=(224, 224), mode="bilinear",
                          align_corners=False)
        x = self.base(x)      # (B, 2048, H, W)
        return self.head(x)   # (B, 2)

    def trainable_params(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def total_params(self):
        return sum(p.numel() for p in self.parameters())
